import { SlashCommandBuilder } from 'discord.js';
import { fetchDataWithHeaders } from '../ao3api.js';

export default {
    data: new SlashCommandBuilder()
        .setName('wordcount')
        .setDescription('Lists all the chapters in a work with chapter title and word count.')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('The URL of the work')
                .setRequired(true)
        ),
    async execute(interaction) {
        let url = interaction.options.getString('url');
        // Acknowledge the command so it doesnt time out with Discord
        await interaction.deferReply();
        try {
            // Extract the base URL for the work and append "/navigate" to retrieve chapter index page
            const baseUrlMatch = url.match(/(https:\/\/archiveofourown\.org\/works\/\d+)/);
            if (!baseUrlMatch) {
                await interaction.editReply('Invalid URL. Please provide a valid work URL.');
                return;
            }
            url = `${baseUrlMatch[1]}/navigate`;
            const $ = await fetchDataWithHeaders(url);

            const chapters = [];
            $('li.chapter').each((index, element) => {
                const chapterTitle = $(element).find('h3.title').text().trim() || `Chapter ${index + 1}`;
                const chapterWordCount = $(element).find('dd.words').text().trim() || '0';
                chapters.push({ title: chapterTitle, words: chapterWordCount });
            });
            
            if (chapters.length === 0) {
                await interaction.editReply('No chapters found or the work is restricted.');
                return;
            }

            const chapterList = chapters.map(chapter => `- **${chapter.title}**: ${chapter.words} words`).join('\n');
            const totalWords = chapters.reduce((sum, chapter) => sum + parseInt(chapter.words.replace(/,/g, '') || 0, 10), 0);

            await interaction.editReply(`**Chapter Word Counts:**\n${chapterList}\n\n**Total Word Count:** ${totalWords} words`);
        } catch (error) {
            console.error(`Error fetching AO3 data: ${error}`);
            await interaction.editReply('An error occurred while fetching the work. Please try again later.');
        }
    },
};