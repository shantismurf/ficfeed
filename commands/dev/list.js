import { SlashCommandBuilder } from 'discord.js';
import { listAo3Links } from '../../tracker.js';

/* TEMPORARILY DISABLED FOR DEVELOPMENT
 * Tracker commands are under development and will be consolidated using subcommands.
 * To re-enable: uncomment the export default block below and remove this comment.
 */

// export default {
const listCommand = {
    data: new SlashCommandBuilder()
        .setName('list')
        .setDescription('List your tracked AO3 works')
        .addStringOption(option =>
            option.setName('search').setDescription('Search by work name, author, notes, or tags').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('status').setDescription('Filter by status').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('start_date').setDescription('Added/finished after (YYYY-MM-DD)').setRequired(false)
        )
        .addStringOption(option =>
            option.setName('end_date').setDescription('Added/finished before (YYYY-MM-DD)').setRequired(false)
        ),
    async execute(interaction) {
        const search = interaction.options.getString('search');
        const status = interaction.options.getString('status');
        const startDate = interaction.options.getString('start_date');
        const endDate = interaction.options.getString('end_date');
        const links = await listAo3Links(interaction.user.id, { search, status, startDate, endDate });
        if (links.length === 0) {
            await interaction.reply('No tracked AO3 works match your filters.');
            return;
        }
        const msg = links.map(l =>
            `${l.work_title || 'Untitled'} by ${l.author_name || 'Unknown'}\n${l.work_url}\nStatus: ${l.status}\n`
        ).join('\n');
        await interaction.reply(msg);
    },
};