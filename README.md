# ficfeed
v0.2.0-alpha - AO3 ficfeed Discord bot Pre-release
Authors: geodebreaker and shantismurf

Purpose:
Aggregates all links to AO3 works into a single channel where they are posted as embeds with work info.

v0.2.0 Release:
- Reworked the bot to work instantaneously when a message is posted to a public channel using the discord.js API.

Future development:
- add handling for links to series and collections
- add commands to edit bot configuration from the server

To install:
- Edit config.json with your token, the channel ID you want your feed posted to, and your server (guild) ID.
- The bot must have all Privileged Gateway Intents enabled in the Discord Developer Panel.
- It will process links in any channel that the bot user can read.
