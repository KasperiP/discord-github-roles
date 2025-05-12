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
   * Get contributors for a repository
   */
  async getRepositoryContributors(owner: string, repo: string) {
    const endpoint = `/repos/${owner}/${repo}/contributors`;
    const url = `${this.baseUrl}${endpoint}`;

    try {
      log.debug({ endpoint }, 'Making GitHub API request');

      const response = await fetch(url, {
        headers: {
          ...this.headers,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      // Handle response errors
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorData}`);
      }

      // Get the data from the response
      const data = (await response.json()) as GitHubContributor[];

      // Map to an array of usernames/logins
      let contributors = data?.map((user) => user.login.toLowerCase()) || [];

      // Handle pagination to ensure we get ALL contributors
      let nextUrl = this.getNextPageUrl(response.headers.get('Link'));
      while (nextUrl) {
        log.debug(
          { owner, repo, nextUrl },
          'Fetching next page of contributors',
        );

        const nextResponse = await fetch(nextUrl, {
          headers: this.headers,
        });

        if (!nextResponse.ok) {
          const errorData = await nextResponse.text();
          throw new Error(
            `GitHub API error: ${nextResponse.status} - ${errorData}`,
          );
        }

        const nextData = (await nextResponse.json()) as GitHubContributor[];

        if (nextData && nextData.length > 0) {
          // Add contributors from this page
          contributors = [
            ...contributors,
            ...nextData.map((user) => user.login.toLowerCase()),
          ];

          // Get next page URL
          nextUrl = this.getNextPageUrl(nextResponse.headers.get('Link'));
        } else {
          break;
        }
      }

      log.info(
        { owner, repo, count: contributors.length },
        'Retrieved repository contributors',
      );

      return { contributors };
    } catch (error) {
      logError(log, `Failed to get contributors for ${owner}/${repo}`, error);
      throw error;
    }
  }

  /**
   * Get stargazers for a repository with pagination support
   */
  async getRepositoryStargazers(owner: string, repo: string) {
    const endpoint = `/repos/${owner}/${repo}/stargazers`;

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          ...this.headers,
          // Request for simple stargazer list
          Accept: 'application/vnd.github.v3.star+json',
        },
      });

      // Handle response errors
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${errorData}`);
      }

      // Get the data from the response
      const data = (await response.json()) as GitHubStargazer[];

      let stargazers =
        data
          .filter((star) => star && star.user && star.user.login)
          .map((star) => star.user.login.toLowerCase()) || [];

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
          stargazers = [
            ...stargazers,
            ...nextData
              .filter((star) => star && star.user && star.user.login)
              .map((star) => star.user.login.toLowerCase()),
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

      return { stargazers };
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
