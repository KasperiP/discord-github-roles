import { createChildLogger, logError } from '../utils/logger';

const log = createChildLogger('github-api');

// Define types for GitHub API responses
interface GitHubContributor {
  login: string;
}

interface GitHubStargazer {
  user: {
    login: string;
  };
}

export class GitHubApiClient {
  private baseUrl = 'https://api.github.com';
  private headers: Record<string, string>;

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
   * Make an API request to GitHub
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    etag?: string,
  ): Promise<{ data: T | null; etag?: string; notModified: boolean }> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${this.baseUrl}${endpoint}`;

    // Set headers for the request
    const headers = { ...this.headers, ...options.headers };

    // If we have an ETag, use it for conditional requests
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      log.debug({ endpoint }, 'Making GitHub API request');

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const responseEtag = response.headers.get('ETag') || undefined;

      // Handle 304 Not Modified (when using etags)
      if (response.status === 304) {
        log.debug({ endpoint }, 'Resource not modified since last request');
        return { data: null, etag: responseEtag, notModified: true };
      }

      // Handle successful responses
      if (response.ok) {
        let data = null;

        // Only try to parse JSON if the response has content
        const contentLength = response.headers.get('content-length');
        if (contentLength !== '0') {
          data = await response.json();
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
            Accept: 'application/vnd.github.v3+json',
          },
        },
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
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...this.headers,
          // Request for simple stargazer list
          Accept: 'application/vnd.github.v3.star+json',
          ...(etag ? { 'If-None-Match': etag } : {}),
        },
      });

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

        const nextResponse = await fetch(nextUrl, {
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
