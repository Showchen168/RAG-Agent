import { generateText } from 'ai'
import { getProvider } from './providers'

export async function analyzeImage(imageBuffer: Buffer): Promise<string> {
    try {
        const { text } = await generateText({
            model: getProvider('gemini-flash'),
            experimental_telemetry: {
              isEnabled: true,
              functionId: 'vision-analyzer',
              metadata: { feature: 'vision-analysis' },
            },
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: 'Analyze this document page image. Please provide a detailed description in Traditional Chinese (Taiwan) of any charts, graphs, diagrams, infographics, or significant visual layouts present. Extract data points, trends, and key insights. If the page only contains standard text, return "No significant visual content." or a brief summary. Focus on what cannot be easily captured by pure text extraction. \n\n請務必使用繁體中文（台灣）回答。',
                        },
                        {
                            type: 'image',
                            image: imageBuffer,
                        },
                    ],
                },
            ],
        })

        return text
    } catch (error) {
        console.error('Vision analysis failed:', error)
        return ''
    }
}
