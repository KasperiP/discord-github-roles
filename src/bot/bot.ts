import { Client, Events, GatewayIntentBits } from 'discord.js';

export function createBot(token: string) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  });

  client.login(token);
  return client;
}
