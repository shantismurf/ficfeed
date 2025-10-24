export function testEnvironment() { 
    return true; 
    //return false;
}
import mysql from 'mysql2/promise';
import config from './config.json' with { type: 'json' };
const DBHOST = config.DBHOST;
const DBUSER = config.DBUSER;
const DBPASSWORD = config.DBPASSWORD;
const DBDATABASE = config.DBDATABASE;
export const db = await mysql.createConnection({
    host: DBHOST,
    user: DBUSER,
    password: DBPASSWORD,
    database: DBDATABASE
});
export function formattedDate() {
    let now = new Date();
    now = now.toISOString().replace(/\.\d+Z$/, '')
    now = now.replace('T', ' ');
    return now;
}
export function sanitize(input) {
    input = (!input ? '' : input);
    input = input
        .replace(/&quot;|&#34;/g, '\"')
        .replace(/&amp;|&#38;/g, '&')
        .replace(/&apos;|&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ');
    //Special characters such as asterisks (*), underscores (_), and tildes (~) 
    //that are to be displayed must be escaped with the \ character.
    input = input
        .replace(/[\*]/g, '\\*')
        .replace(/[\_]/g, '\\_')
        .replace(/[\~]/g, '\\~');
    //replace common html tags with markdown
    input = input
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<s>/gi, '~~')
        .replace(/<\/s>/gi, '~~')
        .replace(/<i>/gi, '*')
        .replace(/<\/i>/gi, '*')
        .replace(/<b>/gi, '**')
        .replace(/<\/b>/gi, '**')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/gi, '')
        .replace(/\n\n\n/gi, '\n\n'); //remove excess new lines
    if (input.length > 1024) {  //limit values to 1024 characters
        input = input.substring(0, 1021) + '...';
    }
    return input;
}
export function userStats() {
    //set user-defined parameters (someday)
    /* Discord and AO3 rules:
    Embed titles are limited to 256 characters
    Embed descriptions are limited to 4096 characters
    There can be up to 25 fields
    A field's name is limited to 256 characters and its value to 1024 characters
    The footer text is limited to 2048 characters
    The author name is limited to 256 characters
    The sum of all characters from all embed structures in a message must not exceed 6000 characters
    10 embeds can be sent per message
    Special characters such as asterisks (*), underscores (_), and tildes (~) must be escaped with the \ character.
    Tag cannot include the following restricted characters: , ^ * < > { } = ` ， 、 \ %
    75 is the total number of fandom, character, relationship, and additional tags that can be added to a work
    Tags may be up to 100 characters long and can include characters from most languages, numbers, spaces, and some punctuation.
    */
    let userStats = {};
    userStats.processAdultLinks = 2;
    //processAdultLinks: 
    // 1 = post all links to the regular feedChannel, 
    // 2 = post adult links to both the regular channel and the adult channel, 
    // 3 = filter adult links to adult channel only and all others to regular channel  
    userStats.workauthorlength = 230; //max 230 to allow for label text (10) and possible spaces, commas, and elipsis (cannot exceed 256)
    userStats.worksummarylength = 400; //max 1024
    userStats.worktaglength = 400; //max 1024
    userStats.seriesdesclength = 400;
    userStats.worktitlelength = 256; //max 256
    userStats.silent = true; //suppress notifications on ficfeed posts

    return userStats;
}

import { Client, GatewayIntentBits } from 'discord.js';
export class DiscordClient { // Create a new client instance
    static instance;
    static getInstance() {
        if (!DiscordClient.instance) {
            DiscordClient.instance = new Client({
                    intents: [
                        GatewayIntentBits.Guilds,
                        GatewayIntentBits.GuildMessages,
                        GatewayIntentBits.MessageContent,
                        GatewayIntentBits.GuildMessageReactions,
                        GatewayIntentBits.GuildMembers
                    ]
            });
        }
        return DiscordClient.instance;
    }
}