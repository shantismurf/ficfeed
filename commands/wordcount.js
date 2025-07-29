import { SlashCommandBuilder } from 'discord.js';
import { fetchDataWithHeaders } from '../ao3api.js';
import { formattedDate } from '../utilities.js';

export default {
    data: new SlashCommandBuilder()
        .setName('wordcount')
        .setDescription('Lists all the chapters in a work with title and word count.')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the work')
                .setRequired(true)
        ),
        /**
         * @param {import('discord.js').Interaction} interaction
         */
    async execute(interaction) {
        const url = interaction.options.getString('url');
        await interaction.deferReply();
        const channelID = interaction.channel.id; // Get the ID of the channel where the command was sent
        try {
            // Extract the base URL and append "/navigate"
            const baseUrlMatch = url.match(/(https:\/\/archiveofourown\.org\/works\/\d+)/);
            if (!baseUrlMatch) {
                await interaction.editReply('Invalid URL. Please provide a valid work URL.');
                return;
            }
            const navigateUrl = `${baseUrlMatch[1]}/navigate`;
            // Fetch the chapter index page in a cheerio object
            const $ = await fetchDataWithHeaders(navigateUrl, channelID);
            
            // Extract work metadata
            const h2 = $('h2.heading');
            const workTitle = h2.find('a').first().text().trim();
            const workUrl = `https://archiveofourown.org${h2.find('a').first().attr('href')}`;
            const authors = h2.find('a[rel="author"]').map((_, a) => $(a).text().trim()).get();
            const authorName = authors.join(', ');

            // Setup array and message, extract collection of chapter links
            const chapters = [];
            let chapterList = `## Chapter Index for [${workTitle}](<${workUrl}>) by ${authorName}\n`;;
            const chapterLinks = $('ol.chapter.index.group li a');
            let currentMessage = await interaction.editReply({ content: chapterList, fetchReply: true });
            let messageCharCount = currentMessage.content.length;
            
            // Build the reply with chapter titles and word counts
            for (const element of chapterLinks) {
                const chapterUrl = $(element).attr('href');
                let chapterTitle = $(element).text().trim().replace(/\s+/g, ' ') || 'Untitled';
                //chapterTitle += ` ${$(element).closest('li').find('span.datetime').text().trim()}`;
                console.log(`${formattedDate()}: Fetching word count for ${chapterTitle} at https://archiveofourown.org${chapterUrl}`);
                const chapterWordCount = await fetchChapterWordCount(`https://archiveofourown.org${chapterUrl}`, channelID);
                chapters.push({ title: chapterTitle, words: chapterWordCount });

                const newLine = `${chapterTitle}: ${chapterWordCount} words\n`;

                // If adding this line would exceed 2000 chars, start a new message
                if (messageCharCount + newLine.length > 2000) {
                    currentMessage = await interaction.followUp({ content: "...", fetchReply: true });
                    console.log(`messageCharCount: ${messageCharCount}, start new message`);
                    chapterList = '';
                    messageCharCount = 0;
                }

                chapterList += newLine;
                messageCharCount += newLine.length;

                // Update the message after every chapter is added
                await currentMessage.edit(chapterList);
            }

            if (chapters.length === 0) {
                await currentMessage.edit('No data returned: the work is restricted or the Archive is unavailable.');
                return;
            }
            const totalWords = chapters.reduce((sum, chapter) => sum + chapter.words, 0);
            const totalWordsMsg = `\nTotal Word Count: ${totalWords} words\n-# (may not exactly match AO3 count)\n--------`;
            chapterList += totalWordsMsg;

            // Post the total word count, alone in a new message if needed
            if (messageCharCount + totalWordsMsg.length > 2000) {
                await interaction.followUp({ content: totalWordsMsg });
            } else {
                await currentMessage.edit(chapterList);
            }
        } catch (error) {
            console.error(`Error fetching AO3 data: `, error);
            interaction.editReply(`${chapterList}\nAn error occurred while fetching the work. Please try again later.`);
        }
    },
};

// Helper function to fetch word count for a single chapter
async function fetchChapterWordCount(url, channelID) {
    try {
        const $ = await fetchDataWithHeaders(url, channelID);
        const article = $('div[role=article]');
        const wordCount = article.text().trim().split(/\s+/).length;
        return wordCount;
    } catch (error) {
        console.error(`Error fetching chapter word count for ${url}: ${error}`);
        return 0; // Return 0 if there's an error
    }
}