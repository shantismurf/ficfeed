# ficfeed
- v0.3.0-beta - AO3 ficfeed Discord bot (pre-release)
- Authors: shantismurf and geodebreaker
- Discord: https://discord.gg/XK8AtYVdQU

Purpose:
- Aggregates all links to AO3 works, series, and collections mentioned in any public channel into a single channel where they are posted as embeds with link data.

Release History:
- v0.3.0-beta
  - Final major revision to code.
  - Now processes series and collection links as well as works.
  - Added a skip prefix that suppresses the posting process if:
   - the link is preceded by two underlines separated by a space with another space after: 
    - `_ _ https...` 
   - Also works before links with discord embed suppression: 
    - `_ _ <https...>`
- v0.2.0 Release:
  - Reworked the bot to work instantaneously when a message is posted to a public channel using the discord.js API.


Future development:
- Add command to edit bot configuration from the server
  - Set feed channel
  - Make string length when truncating description and freeform tags configurable
  - Consider other options that may be desired...toggle each field on and off? Change colors?
  - Establish a database for configuration storage
- Develop a /library command that accepts user notes and additional text on warnings and ratings to create embed fic library entries
- Possibly have the bot create a role for itself on install so access can be more easily configured?


To Install:
- Host the bot on your own server. I use bot-hosting.net, which is quite simple and reliable.
- Edit config.json with your token, the channel ID you want your feed posted to, and your server (guild) ID.
- The bot must have all Privileged Gateway Intents enabled in the Discord Developer Panel.
- It will process links in any channel that the bot user can read.