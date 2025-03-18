import { createChildLogger, logError } from '../utils/logger';
import { LRUCache } from 'lru-cache';
import pThrottle from 'p-throttle';

const log = createChildLogger('github-api');

// Cache configuration
interface CacheValue {
  data: unknown;
  etag?: string;
}

const cache = new LRUCache<string, CacheValue>({
  max: 500, // Maximum size of cache
  ttl: 1000 * 60 * 60, // Items in cache expire after 1 hour
});

// Rate limiting configuration - respect GitHub's rate limits
// Core API has 5000 requests per hour = ~83 per minute
const throttle = pThrottle({
  limit: 60,
  interval: 60 * 1000, // 1 minute
});

const throttledFetch = throttle(async (url: string, options?: RequestInit) => {
  return fetch(url, options);
});

// Define types for GitHub API responses
interface GitHubContributor {
  login: string;
}

interface GitHubStargazer {
  user: {
    login: string;
  };
}

// Interface for rate limit information
interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  used: number;
  resource: string;
}

export class GitHubApiClient {
  private baseUrl = 'https://api.github.com';
  private headers: Record<string, string>;
  private rateLimitInfo: RateLimitInfo | null = null;
  private maxRetries = 3;

  constructor(githubToken?: string) {
    this.headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'discord-github-roles',
    };

    if (githubToken) {
      this.headers['Authorization'] = `token ${githubToken}`;
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitInfo(): RateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Check current rate limit status from GitHub API
   */
  async checkRateLimit(): Promise<RateLimitInfo> {
    try {
      const { data } = await this.request<{
        resources: { core: RateLimitInfo };
      }>('/rate_limit', {}, false);

      if (data) {
        this.rateLimitInfo = data.resources.core;
        return this.rateLimitInfo;
      }

      throw new Error('Failed to fetch rate limit information');
    } catch (error) {
      logError(log, 'Failed to check rate limit', error);
      throw error;
    }
  }

  /**
   * Calculate delay for exponential backoff
   */
  private calculateBackoffDelay(retryCount: number): number {
    // Exponential backoff with jitter: 1s, 2s, 4s, etc. + random jitter
    return Math.min(
      1000 * Math.pow(2, retryCount) + Math.random() * 1000,
      60000,
    );
  }

  /**
   * Sleep for the specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitFromHeaders(headers: Headers): void {
    const limit = headers.get('x-ratelimit-limit');
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    const used = headers.get('x-ratelimit-used');
    const resource = headers.get('x-ratelimit-resource') || 'core';

    if (limit && remaining && reset && used) {
      this.rateLimitInfo = {
        limit: parseInt(limit),
        remaining: parseInt(remaining),
        reset: parseInt(reset),
        used: parseInt(used),
        resource,
      };

      // Log when rate limit is running low
      if (this.rateLimitInfo.remaining < 100) {
        const resetDate = new Date(this.rateLimitInfo.reset * 1000);
        log.warn(
          {
            remaining: this.rateLimitInfo.remaining,
            resetTime: resetDate.toISOString(),
            usedRequests: this.rateLimitInfo.used,
            limit: this.rateLimitInfo.limit,
          },
          'GitHub API rate limit is running low',
        );
      }
    }
  }

  /**
   * Make an API request to GitHub with caching support
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    useCache = true,
    etag?: string,
    retryCount = 0,
  ): Promise<{ data: T | null; etag?: string; notModified: boolean }> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;
    const cacheKey = `${options.method || 'GET'}-${url}`;

    // Try to get from cache first if it's a GET request and caching is enabled
    if (useCache && (!options.method || options.method === 'GET')) {
      const cached = cache.get(cacheKey);
      if (cached) {
        log.debug(
          { endpoint, cacheHit: true },
          'Using cached GitHub API response',
        );
        return {
          data: cached.data as T,
          etag: cached.etag,
          notModified: false,
        };
      }
    }

    // Set headers for the request
    const headers = { ...this.headers, ...options.headers };

    // If we have an ETag, use it for conditional requests
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const startTime = Date.now();
      log.debug({ endpoint }, 'Making GitHub API request');

      const response = await throttledFetch(url, {
        ...options,
        headers,
      });

      const duration = Date.now() - startTime;
      log.debug(
        { endpoint, status: response.status, durationMs: duration },
        'GitHub API response received',
      );

      // Update rate limit information from headers
      this.updateRateLimitFromHeaders(response.headers);

      const responseEtag = response.headers.get('ETag') || undefined;

      // Handle 304 Not Modified (when using etags)
      if (response.status === 304) {
        log.debug({ endpoint }, 'Resource not modified since last request');
        return { data: null, etag: responseEtag, notModified: true };
      }

      // Handle rate limiting (primary rate limit)
      if (response.status === 403 || response.status === 429) {
        const rateLimitRemaining = response.headers.get(
          'x-ratelimit-remaining',
        );
        const rateLimitReset = response.headers.get('x-ratelimit-reset');
        const retryAfter = response.headers.get('retry-after');

        // This is likely a rate limit issue
        if (rateLimitRemaining === '0' && rateLimitReset) {
          const resetTime = parseInt(rateLimitReset) * 1000;
          const waitTime = Math.max(0, resetTime - Date.now()) + 1000; // Add 1s buffer

          log.warn(
            {
              endpoint,
              waitTime,
              resetTime: new Date(resetTime).toISOString(),
            },
            'Rate limit exceeded, waiting until reset time',
          );

          if (retryCount < this.maxRetries) {
            await this.sleep(waitTime);
            return this.request<T>(
              endpoint,
              options,
              useCache,
              etag,
              retryCount + 1,
            );
          }
        }
        // Handle secondary rate limits
        else if (retryAfter) {
          const waitSeconds = parseInt(retryAfter);
          log.warn(
            { endpoint, retryAfter: waitSeconds },
            'Secondary rate limit hit, backing off',
          );

          if (retryCount < this.maxRetries) {
            await this.sleep(waitSeconds * 1000);
            return this.request<T>(
              endpoint,
              options,
              useCache,
              etag,
              retryCount + 1,
            );
          }
        }
        // Unknown rate limit or other error
        else if (retryCount < this.maxRetries) {
          const backoffDelay = this.calculateBackoffDelay(retryCount);
          log.warn(
            { endpoint, retryCount, backoffDelay },
            'Request failed, using exponential backoff',
          );
          await this.sleep(backoffDelay);
          return this.request<T>(
            endpoint,
            options,
            useCache,
            etag,
            retryCount + 1,
          );
        }
      }

      // Handle successful responses
      if (response.ok) {
        let data = null;

        // Only try to parse JSON if the response has content
        const contentLength = response.headers.get('content-length');
        if (contentLength !== '0') {
          data = await response.json();
        }

        // Store in cache if it's a GET request
        if (useCache && (!options.method || options.method === 'GET')) {
          cache.set(cacheKey, { data, etag: responseEtag });
        }

        return { data, etag: responseEtag, notModified: false };
      }

      // Handle error responses
      const errorData = await response.text();
      log.error(
        {
          endpoint,
          status: response.status,
          error: errorData,
        },
        'GitHub API error response',
      );

      throw new Error(`GitHub API error: ${response.status} - ${errorData}`);
    } catch (error) {
      // Only retry network errors with exponential backoff
      if (
        error instanceof Error &&
        error.name === 'TypeError' &&
        retryCount < this.maxRetries
      ) {
        const backoffDelay = this.calculateBackoffDelay(retryCount);
        log.warn(
          { endpoint, retryCount, backoffDelay, error: error.message },
          'Network error encountered, retrying with exponential backoff',
        );
        await this.sleep(backoffDelay);
        return this.request<T>(
          endpoint,
          options,
          useCache,
          etag,
          retryCount + 1,
        );
      }

      logError(log, `GitHub API request failed for ${endpoint}`, error);
      throw error;
    }
  }

  /**
   * Get contributors for a repository
   */
  async getRepositoryContributors(owner: string, repo: string, etag?: string) {
    const endpoint = `/repos/${owner}/${repo}/contributors`;

    try {
      const {
        data,
        etag: newEtag,
        notModified,
      } = await this.request<GitHubContributor[]>(
        endpoint,
        {
          headers: {
            // Request for all contributors, regardless of whether they've authored commits
            Accept: 'application/vnd.github.v3+json',
          },
        },
        true,
        etag,
      );

      if (notModified) {
        log.info({ owner, repo }, 'Contributors not modified since last sync');
        return { contributors: null, etag: newEtag, notModified };
      }

      // Map to an array of usernames/logins
      const contributors = data?.map((user) => user.login.toLowerCase()) || [];
      log.info(
        { owner, repo, count: contributors.length },
        'Retrieved repository contributors',
      );

      return { contributors, etag: newEtag, notModified: false };
    } catch (error) {
      logError(log, `Failed to get contributors for ${owner}/${repo}`, error);
      throw error;
    }
  }

  /**
   * Get stargazers for a repository with pagination support
   */
  async getRepositoryStargazers(owner: string, repo: string, etag?: string) {
    const endpoint = `/repos/${owner}/${repo}/stargazers`;

    try {
      const response = await throttledFetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...this.headers,
          // Request for simple stargazer list
          Accept: 'application/vnd.github.v3.star+json',
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
      });

      // Update rate limit information from headers
      this.updateRateLimitFromHeaders(response.headers);

      const responseEtag = response.headers.get('ETag') || undefined;

      // Handle 304 Not Modified (when using etags)
      if (response.status === 304) {
        log.info({ owner, repo }, 'Stargazers not modified since last sync');
        return { stargazers: null, etag: responseEtag, notModified: true };
      }

      // Handle other response errors
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorData}`);
      }

      // Get the data from the response
      const data = (await response.json()) as GitHubStargazer[];

      // Map to an array of usernames/logins
      let stargazers = data.map((star) => star.user.login.toLowerCase()) || [];

      // Handle pagination to ensure we get ALL stargazers
      let nextUrl = this.getNextPageUrl(response.headers.get('Link'));
      while (nextUrl) {
        log.debug({ owner, repo, nextUrl }, 'Fetching next page of stargazers');

        const nextResponse = await throttledFetch(nextUrl, {
          headers: this.headers,
        });

        if (!nextResponse.ok) {
          const errorData = await nextResponse.text();
          throw new Error(
            `GitHub API error: ${nextResponse.status} - ${errorData}`,
          );
        }

        const nextData = (await nextResponse.json()) as GitHubStargazer[];

        if (nextData && nextData.length > 0) {
          // Add stargazers from this page
          stargazers = [
            ...stargazers,
            ...nextData.map((star) => star.user.login.toLowerCase()),
          ];

          // Get next page URL
          nextUrl = this.getNextPageUrl(nextResponse.headers.get('Link'));
        } else {
          break;
        }
      }

      log.info(
        { owner, repo, count: stargazers.length },
        'Retrieved repository stargazers',
      );

      return { stargazers, etag: responseEtag, notModified: false };
    } catch (error) {
      logError(log, `Failed to get stargazers for ${owner}/${repo}`, error);
      throw error;
    }
  }

  /**
   * Extract next page URL from Link header
   */
  private getNextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    // Parse the Link header
    const links = linkHeader.split(',');
    for (const link of links) {
      const [url, rel] = link.split(';');
      if (rel.trim() === 'rel="next"') {
        // Extract URL from the angle brackets
        return url.trim().slice(1, -1);
      }
    }

    return null;
  }
}
