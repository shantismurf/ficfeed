ficfeed
v0.5.0-beta - AO3 ficfeed Discord bot (pre-release)
Author: shantismurf
Discord: https://discord.gg/XK8AtYVdQU
Purpose:

Aggregates all links to AO3 works, series, and collections mentioned in any public 
channel into a single channel where they are reposted as embeds with link data.

To Install:

Host the files on your own server. I use bot-hosting.net, which is quite simple and reliable.
The bot must have all Privileged Gateway Intents enabled in the Discord Developer Panel.

Edit config.json with the following variables:

config.json file variables:
    "TOKEN": "(Discord Token)",
    "GUILD": "(Server ID)",
    "FEEDID": "(Channel ID of main feed output)",
    "ADULTFEEDID": "(Channel ID of adult feed (use main if none))",
    "TESTTOKEN": "(Discord token of test instance)",
    "TESTFEEDID": "(Test feed ID)",
    "TESTADULTFEEDID": "(Test adult feed ID`)",
    "DBHOST": "(mysql hostname)",
    "DBUSER": "(db user)",      
    "DBPASSWORD": "(db password)",
    "DBDATABASE": "tracker"


Release History:

v0.5.0-beta
 - many revisions, mostly for handling omissions like displaying multiple series or collections
 - added /wordcount command that displays a word count per chapter of a work

v0.4.0-beta
 - Total rewrite to use new modules:
   - Cheerio to scrape html more efficiently
   - Axios to pass headers for AO3 bot security
 - Added a list of the first five works in a collection or series
 - Improved sanitization of any user-input fields to convert html to markdown or strip it out, and add escape characters as needed
 - Improved handling of works and series with multiple authors
 - Many minor tweaks and improvements

v0.3.0-beta
 - Major revision to code.
 - Now processes series and collection links as well as works.
 - Added a skip prefix that suppresses the posting process (now removed)

v0.2.0 Release:
 - Reworked the bot to work instantaneously when a message is posted to a public channel using the discord.js API.


Future development:

develop a /tracker command
Add command to edit bot configuration from the server
 - Set feed channel
 - Set string length when truncating description and freeform tags
 - Consider other options that may be desired...toggle each field on and off? Change colors?
Establish a database for configuration storage
Develop a /library command that accepts user notes and additional text on warnings and ratings to create embed rec library entries
Possibly have the bot create a role for itself on install so access can be more easily configured