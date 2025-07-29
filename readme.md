ficfeed
- v0.5.0-beta - AO3 ficfeed Discord bot (pre-release)
- Author: shantismurf
- Discord: https://discord.gg/XK8AtYVdQU
- Purpose:
  - Aggregates all links to AO3 works, series, and collections mentioned in any
  public channel into a single channel where they are reposted as embeds with 
  work data. Mature, Explicit and unrated works can be filtered to an adult-
  only channel. Restricted works are linked with no information.
  - Also includes a command to display word count per chapter of a work.
  
  
To Install:
- Host the files on your own server. 
- Enable all Privileged Gateway Intents in the Discord Developer Panel.
- Create a config.json file in the application's root directory:
```
{
    "TOKEN": "(Discord Token)",
    "GUILD": "(Server ID)",
    "FEEDID": "(Channel ID of main feed output)",
    "ADULTFEEDID": "(Channel ID of adult feed (use main ID if none))",
    "TESTTOKEN": "(Discord token of test instance)",
    "TESTFEEDID": "(Test feed ID)",
    "TESTADULTFEEDID": "(Test adult feed ID`)",
    "DBHOST": "(mysql hostname)",
    "DBUSER": "(db user)",
    "DBPASSWORD": "(db password)",
    "DBDATABASE": "(db name)"
}
```
Release History:

v0.5.0-beta
 - many revisions, mostly for adapting to Archive performance issues and 
     handling things that were omitted like displaying multiple series or 
     collections 
 - added /wordcount command that displays a word count per chapter of a work

v0.4.0-beta
 - Total rewrite to use new modules:
   - Cheerio to scrape html more efficiently
   - Axios to pass headers for AO3 bot security
 - Added a list of the first five works in a collection or series
 - Improved sanitization of any user-input fields to convert html to markdown 
     or strip it out, and add escape characters as needed
 - Improved handling of works and series with multiple authors
 - Many minor tweaks and improvements

v0.3.0-beta
 - Major revision to code.
 - Now processes series and collection links as well as works.
 - Added a skip prefix that suppresses the posting process (now removed)

v0.2.0 Release:
 - Reworked the bot to work instantaneously when a message is posted to a 
     public channel using the discord.js API.


Future development:

Develop a /tracker command for personal tracking of works read and to read

Develop a /library command that aggregates user notes on work, warnings and 
  ratings with scraped work data to create fic rec library entries that the 
  user can copy and paste (so it can be edited later).

Add command to edit bot configuration from the server
 - Set feed channel
 - Set string length when truncating description and freeform tags
 - Consider other options that may be desired...toggle each field on and off? 
     Change colors?
 - store user configuration data in the database

Possibly have the bot create a role for itself on install so channel access can
  be more easily configured
