import { SlashCommandBuilder } from 'discord.js';
import { fetchDataWithHeaders } from '../ao3api.js';

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

        try {
            // Extract the base URL and append "/navigate"
            const baseUrlMatch = url.match(/(https:\/\/archiveofourown\.org\/works\/\d+)/);
            if (!baseUrlMatch) {
                await interaction.editReply('Invalid URL. Please provide a valid work URL.');
                return;
            }
            const navigateUrl = `${baseUrlMatch[1]}/navigate`;

            // Fetch the chapter index page
            const $ = await fetchDataWithHeaders(navigateUrl);

            // Extract chapter titles and word counts
            const chapters = [];
            const chapterLinks = $('ol.chapter.index.group li a');
            
            // Initialize the reply with a placeholder message
            await interaction.editReply('Processing chapters... This may take a moment.');

            for (const element of chapterLinks) {
                const chapterUrl = $(element).attr('href');
                const chapterTitle = $(element).text().trim() || 'Untitled Chapter';
                console.log(`fetchChapterWordCount(https://archiveofourown.org${chapterUrl}: Chapter: ${chapterTitle}, Word Count: ${chapterWordCount}`);
                const chapterWordCount = await fetchChapterWordCount(`https://archiveofourown.org${chapterUrl}`);
                chapters.push({ title: chapterTitle, words: chapterWordCount });
                // Format the current chapter list
                const currentChapterList = chapters.map(chapter => `- **${chapter.title}**: ${chapter.words} words`).join('\n');
                const currentTotalWords = chapters.reduce((sum, chapter) => sum + chapter.words, 0);

                // Update the reply with the current progress
                await interaction.editReply(`**Processing Chapters:**\n${currentChapterList}\n\n**Current Total Word Count:** ${currentTotalWords} words`);
            }

            // Format the response
            if (chapters.length === 0) {
                await interaction.editReply('No chapters found or the work is restricted.');
                return;
            }

            const finalChapterList = chapters.map(chapter => `- **${chapter.title}**: ${chapter.words} words`).join('\n');
            const finalTotalWords = chapters.reduce((sum, chapter) => sum + chapter.words, 0);
            
            await interaction.editReply(`**Chapter Word Counts:**\n${finalChapterList}\n\n**Total Word Count:** ${finalTotalWords} words`);
        } catch (error) {
            console.error(`Error fetching AO3 data: `, error);
            interaction.editReply('An error occurred while fetching the work. Please try again later.');
            // await interaction.editReply('An error occurred while fetching the work. Please try again later.');
        }
    },
};

// Helper function to fetch word count for a single chapter
async function fetchChapterWordCount(url) {
    try {
        const $ = await fetchDataWithHeaders(url);
        const article = $('div[role=article]');
        const wordCount = article.text().trim().split(/\s+/).length;
        return wordCount;
    } catch (error) {
        console.error(`Error fetching chapter word count for ${url}: ${error}`);
        return 0; // Return 0 if there's an error
    }
}