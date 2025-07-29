import {SlashCommandBuilder} from 'discord.js';
import ao3api from '../ao3api.js';
import {sanitize, userStats, formattedDate} from '../utilities.js';

export default {
	data: new SlashCommandBuilder()
		.setName('library')
		.setDescription('Submits a link to the library')
		.addStringOption(option =>
			option.setName('url')
				.setDescription('URL of the work')
				.setRequired(true))
		.addStringOption(option =>
			option.setName('category')
				.setDescription('Library Category - What is the primary theme or setting?')
				.setRequired(true)
				.addChoices(
					{ name: 'bilbo_carries_the_ring', value: '1128184091469156402' },
					{ name: 'crack_humor', value: '1282028908199415902' },
					{ name: 'erebor_never_fell', value: '1128183384045269012' },
					{ name: 'fairytale', value: '1307033368151593092' },
					{ name: 'genderbending', value: '1128183794504044605' },
					{ name: 'modern_au', value: '1128182655154929724' },
					{ name: 'parentshield', value: '1128185484481409084' },
					{ name: 'post_botfa', value: '1128183655152500767' },
					{ name: 'quest_redo', value: '1128183914968657970' },
					{ name: 'reshirement', value: '1128183128842846228' },
					{ name: 'soulmates', value: '1137243626930442250' },
					{ name: 'superangst', value: '1128184720023363624' },
					{ name: 'unique_settings', value: '1128186947962150983' })
			)
		.addBooleanOption(option =>
			option.setName('boolean')
				.setDescription('true/false')),

	async execute(interaction) {
	const url = interaction.options.getString('url');

	try {
		const ao3 = await ao3api(url);
		const category = interaction.options.getChannel('category');
		const channelID = category.id;
		const notes = interaction.options.getString('notes');
		const rating = interaction.options.getString('rating');
		const warning = interaction.options.getString('warning');
		const stats = userStats();
		const processAdultLinks = stats.processAdultLinks;
		const workauthorlength = stats.workauthorlength;
		const worksummarylength = stats.worksummarylength; 
		const worktaglength = stats.worktaglength; 
		const seriesdesclength = stats.seriesdesclength;
		const worktitlelength = stats.worktitlelength;
		let responseText = new EmbedBuilder();

		const linkType = (!ao3.type ? 'link' : ao3.type);
		if (ao3.error) {
			//link is restricted or unavailable		
		} else {
			if (linkType == 'work') {
				responseText.setTitle(ao3.workTitle);
				responseText.setURL(url);
				responseText.setAuthor({ name: ao3.workAuthor, iconURL: ao3.workAuthorImage });
				responseText.setDescription(ao3.workSummary);
				responseText.addFields({ name: 'Rating', value: sanitize(ao3.workRating) });
				responseText.addFields({ name: 'Warnings', value: ao3.workWarning });
				responseText.addFields({ name: 'Notes', value: ao3.workNotes });
				responseText.addFields({ name: 'Summary', value: ao3.workSummary });
			} else if (linkType == 'series') {
				responseText.setTitle(ao3.seriesTitle);
				responseText.setURL(url);
				responseText.setAuthor({ name: ao3.seriesAuthor, iconURL: ao3.seriesAuthorImage });
				responseText.setDescription(ao3.seriesSummary);
				responseText.addFields({ name: 'Rating', value: ao3.seriesRating });
				responseText.addFields({ name: 'Warnings', value: ao3.seriesWarning });
			}
		}
		await channelID.send({ embeds: [responseText] });
		//send a success message
	} catch (error) {
		//send a failure message
		console.error(error);
	}
}
/*
inputs: url, category (dropdown), notes (optional), rating (optional), warning (optional)
**Title** by **author**
<https://archiveofourown.org/works/XXX>
**Rating:** 
**Length:** 
**Warnings:** 
**Notes:** 
**Summary:** 
other stats? date published, number of chapters, tags?, relationships, category
cross-referencing?
*/
};