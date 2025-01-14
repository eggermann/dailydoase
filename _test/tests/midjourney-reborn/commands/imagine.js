const { SlashCommandBuilder } = require('discord.js')


module.exports = {
        data: new SlashCommandBuilder()
                .setName('imagine-bot')
                .setDescription('There are endless possibilities...')
                .addStringOption(option =>
                        option
                                .setName('prompt')
                                .setDescription('The prompt to imagine')
                                .setRequired(true)
                ),
        async execute(interaction) {

                const { default: midjourney } = await import('midjourney-client')
                const prompt = interaction.options.getString('prompt')
                console.log('prompt',prompt)
                midjourney(prompt).then(response => {
                        console.log('console.log(response)',response)
                        if (response.length < 1) {
                                interaction.editReply('Unabled to generate images 😭.')
                        }

                        const imageURLs = response.join('\n')
                        interaction.editReply(`**${prompt}**\n${imageURLs}`)

                })

                await interaction.reply('Generating images, may take up to 7 seconds...')
        }
}
