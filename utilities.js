export function testEnvironment() { 
    return true; 
    //return false;
}
//import mysql from 'mysql2/promise';
import config from './config.json' with { type: 'json' };
const DBHOST = config.DBHOST;
const DBUSER = config.DBUSER;
const DBPASSWORD = config.DBPASSWORD;
const DBDATABASE = config.DBDATABASE;
/* export const db = await mysql.createConnection({
    host: DBHOST,
    user: DBUSER,
    password: DBPASSWORD,
    database: DBDATABASE
}); */
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

import cron from 'node-cron';
// Schedule a task to run on the 1st and 15th at midnight CST
cron.schedule('0 0 1,15 * *', async () => {
    console.log(`***Running fic count task at ${formattedDate()}`);
    const feedChannel = config.ARCHIVESTATSCHANNEL;
    const msgForFeed = await YTDficCount();
    await feedChannel.send(msgForFeed);
    console.log(`***Finished fic count task at ${formattedDate()}`);
}, {
  scheduled: true,
  timezone: "America/Chicago"
});

function getPercentYearLeft() {
    const now = new Date();
    const currentYear = now.getFullYear();
    // Set the start of the current year (January 1st, 00:00:00)
    const yearStart = new Date(currentYear, 0, 1);
    // Set the end of the current year (January 1st of next year, 00:00:00)
    const yearEnd = new Date(currentYear + 1, 0, 1);
    // Calculate total milliseconds in the year
    const totalMillisecondsInYear = yearEnd - yearStart;
    // Calculate milliseconds remaining in the year
    const remainingMilliseconds = yearEnd - now;
    // Calculate and return the percentage left
    return remainingMilliseconds / totalMillisecondsInYear;
}

async function YTDficCount() { 
    const now = new Date();
    const curYear = now.getFullYear();
    const curDate = now.toLocaleDateString('en-US');
    let searchURL = {};
    const base =
        `https://archiveofourown.org/works?` +
        `work_search%5Bquery%5D=created_at%3A%5B%22${curYear}-01-01%22+TO+%22${curYear}-12-31%22%5D` +
        `&tag_id=Bilbo+Baggins*s*Thorin+Oakenshield`;
    searchURL.AllYTD = base;
    searchURL.CompleteYTD = `${base}&work_search%5Bcomplete%5D=T`;
    searchURL.AllEngYTD = `${base}&work_search%5Blanguage_id%5D=en`;
    searchURL.EngCompleteYTD = `${base}&work_search%5Bcomplete%5D=T&work_search%5Blanguage_id%5D=en`;
    searchURL.podficYTD = `${base}&work_search%5Bother_tag_names%5D=Podfic`;
    const ranges = [
        [0, 10000],
        [10001, 30000],
        [30001, 60000],
        [60001, 100000],
        [100001, 1000000]
        ];
    for (const [wordsFrom, wordsTo] of ranges) {
        const key = `wc${wordsFrom}to${wordsTo}`;
        searchURL[key] = base + '&work_search%5Bwords_from%5D=' + wordsFrom + '&work_search%5Bwords_to%5D=' + wordsTo;
    }
    const [
        AllYTD,
        CompleteYTD,
        AllEngYTD,
        EngCompleteYTD,
        PodficYTD,
        wc0to10000, 
        wc10001to30000, 
        wc30001to60000, 
        wc60001to100000, 
        wc100001to1000000
    ] = await Promise.all([
        getSearchCount(searchURL.AllYTD),
        getSearchCount(searchURL.CompleteYTD),
        getSearchCount(searchURL.AllEngYTD),
        getSearchCount(searchURL.EngCompleteYTD),
        getSearchCount(searchURL.podficYTD),
        getSearchCount(searchURL.wc0to10000),
        getSearchCount(searchURL.wc10001to30000),
        getSearchCount(searchURL.wc30001to60000),
        getSearchCount(searchURL.wc60001to100000),
        getSearchCount(searchURL.wc100001to1000000)
    ]);

    const pctComplete = CompleteYTD/AllYTD;
    const pctNonEnglish = 1- (AllEngYTD/AllYTD);
    let pctPartialYear = getPercentYearLeft();
    const ProjectedTotal = AllYTD/pctPartialYear;
    pctPartialYear = (pctPartialYear * 100).toFixed(2) + "%";

    const txtHeaderColumns = 'Date, Total, Complete, English, English Complete, Podfics, % Complete, % Non-English, Partial Year %, Projected Total, (skip and calculate in spreadsheet: Percent change, vs Last Year Total, Posts/Day,) 0-10000, 10001-30000, 30001-60000, 60001-100000, 100001-1000000'
    const content = txtHeaderColumns + `\n\`\`\`${curDate}\t${AllYTD}\t${CompleteYTD}\t${AllEngYTD}\t${EngCompleteYTD}\t${PodficYTD}\t${pctComplete}\t${pctNonEnglish}\t${pctPartialYear}\t${ProjectedTotal}\t\t\t\t${wc0to10000}\t${wc10001to30000}\t${wc30001to60000}\t${wc60001to100000}\t${wc100001to1000000}\`\`\``;
    return content;
}

import { fetchDataWithHeaders } from './ficfeed.js';
async function getSearchCount(url) {
    const ChannelID = config.ARCHIVESTATSCHANNEL;
    const $ = await fetchDataWithHeaders(url,ChannelID);
    const headingText = $('h2.heading').first().text();
    const match = headingText.match(/of\s+([\d,]+)\s+Works/i); // "1 - 20 of 933 Works found in Bilbo Baggins/Thorin Oakenshield"
    const totalWorkCount = match ? parseInt(match[1].replace(/,/g, ''), 10): 0;
    return totalWorkCount;
}   