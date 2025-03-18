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
};

export const IndexPage: FC<IndexPageProps> = ({ user }) => {
  const isFullyLinked = user?.discordAccount && user?.gitHubAccount;
  
  return (
    <div class="container max-w-3xl mx-auto p-6">
      <header class="text-center mb-12">
        <h1 class="text-4xl font-bold mb-4">GitHub & Discord Account Linking</h1>
        <p class="text-xl text-gray-600">
          Connect your Discord and GitHub accounts to access special roles
        </p>
      </header>

      <main>
        {!user ? (
          <div class="bg-white p-6 rounded-lg shadow-md mb-8">
            <h2 class="text-2xl font-semibold mb-4">Get Started</h2>
            <p class="mb-6">
              Sign in with either Discord or GitHub to begin linking your accounts.
            </p>
            <div class="flex flex-col md:flex-row gap-4">
              <a
                href="/auth/discord"
                class="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex-1 text-center flex items-center justify-center"
              >
                <svg class="w-6 h-6 mr-2" viewBox="0 0 127.14 96.36" fill="currentColor">
                  <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                </svg>
                Sign in with Discord
              </a>
              <a
                href="/auth/github"
                class="px-6 py-3 bg-gray-800 text-white rounded-md hover:bg-gray-900 flex-1 text-center flex items-center justify-center"
              >
                <svg class="w-6 h-6 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Sign in with GitHub
              </a>
            </div>
          </div>
        ) : (
          <div class="bg-white p-6 rounded-lg shadow-md">
            {isFullyLinked && (
              <div class="mb-6 p-3 bg-green-100 rounded-md border border-green-300 text-green-700 flex items-center">
                <svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>Your accounts are fully linked! You now have access to all features.</span>
              </div>
            )}
            
            <h2 class="text-2xl font-semibold mb-4">Your Linked Accounts</h2>
            
            <div class="grid md:grid-cols-2 gap-6 mb-8">
              {/* Discord Account Card */}
              <div class="border rounded-lg p-5">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="text-xl font-medium">Discord</h3>
                  {user.discordAccount ? (
                    <span class="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full">
                      Connected
                    </span>
                  ) : (
                    <span class="bg-gray-100 text-gray-800 text-xs px-3 py-1 rounded-full">
                      Not Connected
                    </span>
                  )}
                </div>
                
                {user.discordAccount ? (
                  <p class="mb-4">
                    <strong>Username:</strong> {user.discordAccount.username}
                  </p>
                ) : (
                  <div class="mt-4">
                    <a
                      href="/auth/discord"
                      class="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 inline-block"
                    >
                      Connect Discord
                    </a>
                  </div>
                )}
              </div>
              
              {/* GitHub Account Card */}
              <div class="border rounded-lg p-5">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="text-xl font-medium">GitHub</h3>
                  {user.gitHubAccount ? (
                    <span class="bg-green-100 text-green-800 text-xs px-3 py-1 rounded-full">
                      Connected
                    </span>
                  ) : (
                    <span class="bg-gray-100 text-gray-800 text-xs px-3 py-1 rounded-full">
                      Not Connected
                    </span>
                  )}
                </div>
                
                {user.gitHubAccount ? (
                  <p class="mb-4">
                    <strong>Username:</strong> {user.gitHubAccount.username}
                  </p>
                ) : (
                  <div class="mt-4">
                    <a
                      href="/auth/github"
                      class="px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-900 inline-block"
                    >
                      Connect GitHub
                    </a>
                  </div>
                )}
              </div>
            </div>
            
            <div class="mt-8 p-4 bg-blue-50 rounded-md">
              <h3 class="text-lg font-medium mb-2">What Happens Next?</h3>
              <p class="text-gray-700">
                Once you've connected both accounts, you'll automatically receive 
                the appropriate roles in our Discord server based on your GitHub
                organization membership and contributions.
              </p>
            </div>
            
            <div class="mt-8 border-t pt-6 flex justify-between">
              <a 
                href="/auth/logout"
                class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600"
              >
                Sign Out
              </a>
              
              <form action="/auth/unlink" method="post">
                <button 
                  class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700" 
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
      
      <footer class="mt-12 text-center text-gray-500 text-sm">
        <p>© {new Date().getFullYear()} GitHub-Discord Roles Integration</p>
      </footer>
    </div>
  );
};
