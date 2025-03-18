export const config = {
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    token: process.env.DISCORD_TOKEN || '',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
  },
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
};

function validateConfig() {
  const requiredKeys = [
    'discord.clientId',
    'discord.clientSecret',
    'discord.token',
    'github.clientId',
    'github.clientSecret',
    'baseUrl',
  ];

  for (const key of requiredKeys) {
    const [section, name] = key.split('.');
    if (section && name) {
      if (!config[section][name]) {
        throw new Error(`Missing required configuration: ${key}`);
      }
    } else if (!config[key]) {
      throw new Error(`Missing required configuration: ${key}`);
    }
  }
}

validateConfig();
