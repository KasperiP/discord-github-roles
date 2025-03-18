-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GitHubAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "githubId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "GitHubAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiscordAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "DiscordAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "contributorRoleId" TEXT,
    "stargazerRoleId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FollowedRepository" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildConfigId" TEXT NOT NULL,
    CONSTRAINT "FollowedRepository_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuildSyncHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildConfigId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "totalProcessed" INTEGER NOT NULL DEFAULT 0,
    "rolesAdded" INTEGER NOT NULL DEFAULT 0,
    "rolesRemoved" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GuildSyncHistory_guildConfigId_fkey" FOREIGN KEY ("guildConfigId") REFERENCES "GuildConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RepositorySyncState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryFullName" TEXT NOT NULL,
    "lastContributorSync" DATETIME,
    "lastStargazerSync" DATETIME,
    "contributorEtag" TEXT,
    "stargazerEtag" TEXT,
    "lastSyncError" TEXT
);

-- CreateTable
CREATE TABLE "ContributorCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryFullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContributorCache_repositoryFullName_fkey" FOREIGN KEY ("repositoryFullName") REFERENCES "RepositorySyncState" ("repositoryFullName") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StargazerCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "repositoryFullName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StargazerCache_repositoryFullName_fkey" FOREIGN KEY ("repositoryFullName") REFERENCES "RepositorySyncState" ("repositoryFullName") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubAccount_githubId_key" ON "GitHubAccount"("githubId");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubAccount_userId_key" ON "GitHubAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccount_discordId_key" ON "DiscordAccount"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "DiscordAccount_userId_key" ON "DiscordAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildConfig_guildId_key" ON "GuildConfig"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowedRepository_guildConfigId_owner_name_key" ON "FollowedRepository"("guildConfigId", "owner", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RepositorySyncState_repositoryFullName_key" ON "RepositorySyncState"("repositoryFullName");

-- CreateIndex
CREATE INDEX "ContributorCache_repositoryFullName_idx" ON "ContributorCache"("repositoryFullName");

-- CreateIndex
CREATE INDEX "ContributorCache_username_idx" ON "ContributorCache"("username");

-- CreateIndex
CREATE INDEX "StargazerCache_repositoryFullName_idx" ON "StargazerCache"("repositoryFullName");

-- CreateIndex
CREATE INDEX "StargazerCache_username_idx" ON "StargazerCache"("username");
