import {
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { prisma } from '../index';

// Define command builders
const commands = [
  new SlashCommandBuilder()
    .setName('setup-contributor-role')
    .setDescription('Set up a role for GitHub repository contributors')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to assign to contributors')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('remove-contributor-role')
    .setDescription('Remove the configured contributor role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setup-stargazer-role')
    .setDescription('Set up a role for GitHub repository stargazers')
    .addRoleOption((option) =>
      option
        .setName('role')
        .setDescription('The role to assign to stargazers')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('remove-stargazer-role')
    .setDescription('Remove the configured stargazer role')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('show-config')
    .setDescription('Show current role configuration for this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('follow-repository')
    .setDescription('Add a GitHub repository to follow for role assignments')
    .addStringOption((option) =>
      option
        .setName('owner')
        .setDescription(
          'GitHub username or organization that owns the repository',
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Repository name')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('unfollow-repository')
    .setDescription('Remove a GitHub repository from being followed')
    .addStringOption((option) =>
      option
        .setName('owner')
        .setDescription(
          'GitHub username or organization that owns the repository',
        )
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Repository name')
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('list-repositories')
    .setDescription('List all followed GitHub repositories')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

export function createBot(token: string) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // Register commands when bot is ready
  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);

    // Register slash commands with Discord API
    const rest = new REST({ version: '10' }).setToken(token);

    try {
      console.log('Started refreshing application (/) commands.');

      await rest.put(Routes.applicationCommands(readyClient.user.id), {
        body: commands,
      });

      console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Error refreshing application commands:', error);
    }
  });

  // Handle interaction events (commands)
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Verify that the command is being used in a guild (server)
    if (!interaction.guild) {
      await interaction.reply({
        content: 'This command can only be used in a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Verify that the user has administrator permissions
    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
    ) {
      await interaction.reply({
        content: 'You need administrator permissions to use this command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'setup-contributor-role':
          await setupContributorRole(interaction);
          break;
        case 'remove-contributor-role':
          await removeContributorRole(interaction);
          break;
        case 'setup-stargazer-role':
          await setupStargazerRole(interaction);
          break;
        case 'remove-stargazer-role':
          await removeStargazerRole(interaction);
          break;
        case 'show-config':
          await showConfig(interaction);
          break;
        case 'follow-repository':
          await followRepository(interaction);
          break;
        case 'unfollow-repository':
          await unfollowRepository(interaction);
          break;
        case 'list-repositories':
          await listRepositories(interaction);
          break;
      }
    } catch (error) {
      console.error(`Error handling command ${commandName}:`, error);
      await interaction
        .reply({
          content: 'An error occurred while processing your command.',
          flags: MessageFlags.Ephemeral,
        })
        .catch(console.error);
    }
  });

  client.login(token);
  return client;
}

// Command handler functions
async function setupContributorRole(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole('role');

  if (!role) {
    await interaction.reply({
      content: 'Please provide a valid role.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guild!.id },
    update: {
      contributorRoleId: role.id,
      updatedAt: new Date(),
    },
    create: {
      guildId: interaction.guild!.id,
      contributorRoleId: role.id,
    },
  });

  await interaction.reply({
    content: `Successfully set ${role.name} as the contributor role.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function removeContributorRole(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild!.id },
  });

  if (!config || !config.contributorRoleId) {
    await interaction.reply({
      content: 'No contributor role is currently configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.update({
    where: { guildId: interaction.guild!.id },
    data: {
      contributorRoleId: null,
      updatedAt: new Date(),
    },
  });

  await interaction.reply({
    content: 'The contributor role has been removed from configuration.',
    flags: MessageFlags.Ephemeral,
  });
}

async function setupStargazerRole(interaction: ChatInputCommandInteraction) {
  const role = interaction.options.getRole('role');

  if (!role) {
    await interaction.reply({
      content: 'Please provide a valid role.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.upsert({
    where: { guildId: interaction.guild!.id },
    update: {
      stargazerRoleId: role.id,
      updatedAt: new Date(),
    },
    create: {
      guildId: interaction.guild!.id,
      stargazerRoleId: role.id,
    },
  });

  await interaction.reply({
    content: `Successfully set ${role.name} as the stargazer role.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function removeStargazerRole(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild!.id },
  });

  if (!config || !config.stargazerRoleId) {
    await interaction.reply({
      content: 'No stargazer role is currently configured.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await prisma.guildConfig.update({
    where: { guildId: interaction.guild!.id },
    data: {
      stargazerRoleId: null,
      updatedAt: new Date(),
    },
  });

  await interaction.reply({
    content: 'The stargazer role has been removed from configuration.',
    flags: MessageFlags.Ephemeral,
  });
}

async function showConfig(interaction: ChatInputCommandInteraction) {
  const config = await prisma.guildConfig.findUnique({
    where: { guildId: interaction.guild!.id },
    include: {
      repositories: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!config) {
    await interaction.reply({
      content: 'No configuration found for this server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  let responseMessage = 'Current configuration:\n';

  if (config.contributorRoleId) {
    const contributorRole = interaction.guild!.roles.cache.get(
      config.contributorRoleId,
    );
    responseMessage += `• Contributor Role: ${contributorRole ? contributorRole.name : 'Unknown Role'} (ID: ${config.contributorRoleId})\n`;
  } else {
    responseMessage += '• Contributor Role: Not configured\n';
  }

  if (config.stargazerRoleId) {
    const stargazerRole = interaction.guild!.roles.cache.get(
      config.stargazerRoleId,
    );
    responseMessage += `• Stargazer Role: ${stargazerRole ? stargazerRole.name : 'Unknown Role'} (ID: ${config.stargazerRoleId})\n`;
  } else {
    responseMessage += '• Stargazer Role: Not configured\n';
  }

  // Add repository count
  responseMessage += `• Followed Repositories: ${config.repositories.length} (use /list-repositories to see details)`;

  await interaction.reply({
    content: responseMessage,
    flags: MessageFlags.Ephemeral,
  });
}

async function followRepository(interaction: ChatInputCommandInteraction) {
  const owner = interaction.options.getString('owner', true);
  const name = interaction.options.getString('name', true);

  if (!owner || !name) {
    await interaction.reply({
      content: 'Please provide both repository owner and name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Validate repository format (simple check)
  if (!/^[a-zA-Z0-9_.-]+$/.test(owner) || !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    await interaction.reply({
      content: 'Invalid repository owner or name format.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Create or get guild config
    const guildConfig = await prisma.guildConfig.upsert({
      where: { guildId: interaction.guild!.id },
      update: {
        updatedAt: new Date(),
      },
      create: {
        guildId: interaction.guild!.id,
      },
    });

    // Check if repository is already being followed
    const existingRepo = await prisma.followedRepository.findFirst({
      where: {
        guildConfigId: guildConfig.id,
        owner: {
          equals: owner,
          mode: 'insensitive', // Case-insensitive match
        },
        name: {
          equals: name,
          mode: 'insensitive', // Case-insensitive match
        },
      },
    });

    if (existingRepo) {
      await interaction.reply({
        content: `Repository ${owner}/${name} is already being followed.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Try to validate if repository exists
    const repoCheckResponse = await fetch(
      `https://api.github.com/repos/${owner}/${name}`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'discord-github-roles',
        },
      },
    );

    if (!repoCheckResponse.ok) {
      await interaction.reply({
        content: `Repository ${owner}/${name} doesn't seem to exist or is not accessible. Please check the name and try again.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Add repository to followed list
    await prisma.followedRepository.create({
      data: {
        owner,
        name,
        guildConfigId: guildConfig.id,
      },
    });

    await interaction.reply({
      content: `Now following GitHub repository: ${owner}/${name}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error following repository:', error);
    await interaction.reply({
      content: `Failed to follow repository ${owner}/${name}. Please try again later.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function unfollowRepository(interaction: ChatInputCommandInteraction) {
  const owner = interaction.options.getString('owner', true);
  const name = interaction.options.getString('name', true);

  if (!owner || !name) {
    await interaction.reply({
      content: 'Please provide both repository owner and name.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    // Find the guild config
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild!.id },
    });

    if (!guildConfig) {
      await interaction.reply({
        content: 'No configuration found for this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Find and delete the repository
    const deletedRepo = await prisma.followedRepository.deleteMany({
      where: {
        guildConfigId: guildConfig.id,
        owner: {
          equals: owner,
          mode: 'insensitive', // Case-insensitive match
        },
        name: {
          equals: name,
          mode: 'insensitive', // Case-insensitive match
        },
      },
    });

    if (deletedRepo.count > 0) {
      await interaction.reply({
        content: `Stopped following GitHub repository: ${owner}/${name}`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: `Repository ${owner}/${name} was not being followed.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error('Error unfollowing repository:', error);
    await interaction.reply({
      content: `Failed to unfollow repository ${owner}/${name}. Please try again later.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function listRepositories(interaction: ChatInputCommandInteraction) {
  try {
    // Find the guild config with repositories
    const guildConfig = await prisma.guildConfig.findUnique({
      where: { guildId: interaction.guild!.id },
      include: {
        repositories: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!guildConfig || guildConfig.repositories.length === 0) {
      await interaction.reply({
        content: 'No repositories are currently being followed in this server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const repoList = guildConfig.repositories
      .map((repo, index) => `${index + 1}. ${repo.owner}/${repo.name}`)
      .join('\n');

    await interaction.reply({
      content: `**Followed GitHub Repositories:**\n${repoList}`,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error('Error listing repositories:', error);
    await interaction.reply({
      content: 'Failed to list repositories. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
