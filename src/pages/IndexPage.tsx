import { FC } from 'hono/jsx';

type User = {
  id: string;
  discordAccount?: {
    username: string;
    discordId: string;
  } | null;
  gitHubAccount?: {
    username: string;
    githubId: string;
  } | null;
};

type IndexPageProps = {
  user: User | null;
  error?: string;
};

export const IndexPage: FC<IndexPageProps> = ({ user, error }) => {
  const isFullyLinked = user?.discordAccount && user?.gitHubAccount;
  
  return (
    <div class="container">
      <header class="header">
        <h1>GitHub & Discord Account Linking</h1>
        <p>Connect your accounts to access special roles</p>
      </header>

      <main>
        {error && (
          <div class="error-banner">
            <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>{error}</span>
          </div>
        )}

        {!user ? (
          <div class="card intro-card">
            <h2>Get Started</h2>
            <p>Sign in with either Discord or GitHub to begin linking your accounts.</p>
            <div class="auth-buttons">
              <a href="/auth/discord" class="btn btn-discord">
                <svg class="icon" viewBox="0 0 127.14 96.36" fill="currentColor">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                Sign in with Discord
              </a>
              <a href="/auth/github" class="btn btn-github">
                <svg class="icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Sign in with GitHub
              </a>
            </div>
          </div>
        ) : (
          <div class="card profile-card">
            {isFullyLinked && (
              <div class="success-banner">
                <svg class="check-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>Your accounts are fully linked! You now have access to all features.</span>
              </div>
            )}
            
            <h2>Your Linked Accounts</h2>
            
            <div class="account-grid">
              {/* Discord Account Card */}
              <div class="account-card">
                <div class="account-header">
                  <h3>Discord</h3>
                  {user.discordAccount ? (
                    <span class="badge badge-connected">Connected</span>
                  ) : (
                    <span class="badge badge-disconnected">Not Connected</span>
                  )}
                </div>
                
                {user.discordAccount ? (
                  <p class="username">
                    <strong>Username:</strong> {user.discordAccount.username}
                  </p>
                ) : (
                  <div class="connect-action">
                    <a href="/auth/discord" class="btn btn-connect btn-discord-light">
                      Connect Discord
                    </a>
                  </div>
                )}
              </div>
              
              {/* GitHub Account Card */}
              <div class="account-card">
                <div class="account-header">
                  <h3>GitHub</h3>
                  {user.gitHubAccount ? (
                    <span class="badge badge-connected">Connected</span>
                  ) : (
                    <span class="badge badge-disconnected">Not Connected</span>
                  )}
                </div>
                
                {user.gitHubAccount ? (
                  <p class="username">
                    <strong>Username:</strong> {user.gitHubAccount.username}
                  </p>
                ) : (
                  <div class="connect-action">
                    <a href="/auth/github" class="btn btn-connect btn-github-light">
                      Connect GitHub
                    </a>
                  </div>
                )}
              </div>
            </div>
            
            <div class="info-banner">
              <h3>What Happens Next?</h3>
              <p>
                Once you've connected both accounts, you'll automatically receive 
                the appropriate roles in our Discord server based on your GitHub
                organization membership and contributions.
              </p>
              
              <button 
                class="btn btn-admin" 
                onclick="document.getElementById('admin-modal').style.display='flex'"
              >
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Server Administrator Information
              </button>
            </div>
            
            {/* Admin Modal with improved mobile support */}
            <div 
              id="admin-modal" 
              class="modal"
              onclick="if(event.target === this) document.getElementById('admin-modal').style.display='none'"
            >
              <div 
                class="modal-content"
                onclick="event.stopPropagation()"
              >
                <div class="modal-header">
                  <h3>Discord Server Administrator Commands</h3>
                  <button 
                    class="modal-close" 
                    onclick="document.getElementById('admin-modal').style.display='none'"
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>
                <div class="modal-body">
                  <p>
                    As a Discord server administrator, you can use the following slash commands 
                    to configure role assignments:
                  </p>
                  <h4>Role Management</h4>
                  <ul class="command-list">
                    <li><code>/setup-contributor-role</code> - Set a role for GitHub contributors</li>
                    <li><code>/remove-contributor-role</code> - Remove the contributor role setting</li>
                    <li><code>/setup-stargazer-role</code> - Set a role for GitHub repository stargazers</li>
                    <li><code>/remove-stargazer-role</code> - Remove the stargazer role setting</li>
                  </ul>
                  
                  <h4>Repository Management</h4>
                  <ul class="command-list">
                    <li><code>/follow-repository</code> - Add a GitHub repository to follow for role assignments</li>
                    <li><code>/unfollow-repository</code> - Remove a GitHub repository from being followed</li>
                    <li><code>/list-repositories</code> - List all followed GitHub repositories</li>
                    <li><code>/show-config</code> - Display current role configuration</li>
                  </ul>
                  
                  <p class="modal-note">
                    Note: All commands require administrator permissions in your Discord server.
                  </p>
                </div>
              </div>
            </div>
            
            <div class="action-footer">
              <a href="/auth/logout" class="btn btn-secondary">
                Sign Out
              </a>
              
              <form action="/auth/unlink" method="post">
                <button 
                  class="btn btn-danger" 
                  type="submit"
                  onclick="return confirm('Are you sure you want to permanently delete your account and all linked services? This cannot be undone.')"
                >
                  Delete Account
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
      
      <footer class="footer">
        <p>
          <a href="https://github.com/KasperiP/discord-github-roles" target="_blank" class="source-link">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View Source Code
          </a> • {new Date().getFullYear()}
        </p>
      </footer>
      
      {/* Add simple script to handle ESC key for closing the modal */}
      <script dangerouslySetInnerHTML={{__html: `
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            document.getElementById('admin-modal').style.display = 'none';
          }
        });
      `}}></script>
    </div>
  );
};
