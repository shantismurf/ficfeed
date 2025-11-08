import { SlashCommandBuilder } from 'discord.js';
import { updateAo3Link } from '../../tracker.js';

/* TEMPORARILY DISABLED FOR DEVELOPMENT
 * Tracker commands are under development and will be consolidated using subcommands.
 * To re-enable: uncomment the export default block below and remove this comment.
 */

// export default {
const updateCommand = {
    data: new SlashCommandBuilder()
        .setName('update')
        .setDescription('Update a tracked AO3 work')
        .addStringOption(option =>
            option.setName('url').setDescription('AO3 work URL').setRequired(true)
        )
        .addStringOption(option =>
            option.setName('status').setDescription('New status').setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('chapter').setDescription('Last chapter read').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('notes').setDescription('Notes').setRequired(false)
        ),
    async execute(interaction) {
        const url = interaction.options.getString('url');
        const status = interaction.options.getString('status');
        const lastChapterRead = interaction.options.getInteger('chapter');
        const notes = interaction.options.getString('notes');
        await updateAo3Link(interaction.user.id, url, { status, lastChapterRead, notes });
        await interaction.reply('AO3 work updated!');
    },
};