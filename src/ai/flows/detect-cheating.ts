// src/ai/flows/detect-cheating.ts
'use server';

/**
 * @fileOverview Detects potential cheating attempts by analyzing response times and entered text.
 *
 * - detectCheating - A function that analyzes response times and text to detect cheating.
 * - DetectCheatingInput - The input type for the detectCheating function.
 * - DetectCheatingOutput - The return type for the detectCheating function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectCheatingInputSchema = z.object({
  responseTime: z.number().describe('Il tempo impiegato per rispondere alla domanda in secondi.'),
  answerText: z.string().describe('Il testo fornito come risposta.'),
  questionText: z.string().describe('Il testo della domanda posta.'),
});

export type DetectCheatingInput = z.infer<typeof DetectCheatingInputSchema>;

const DetectCheatingOutputSchema = z.object({
  isCheating: z.boolean().describe('Indica se il partecipante sta probabilmente barando.'),
  reason: z.string().describe('Il motivo della determinazione del tentativo di barare.'),
});

export type DetectCheatingOutput = z.infer<typeof DetectCheatingOutputSchema>;

export async function detectCheating(input: DetectCheatingInput): Promise<DetectCheatingOutput> {
  // If the API key is not set, default to not cheating.
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    console.warn("GEMINI_API_KEY or GOOGLE_API_KEY not set. Skipping cheat detection.");
    return {
        isCheating: false,
        reason: "API key not configured.",
    };
  }
  try {
    return await detectCheatingFlow(input);
  } catch (error) {
    console.error("Error in cheat detection flow:", error);
    return {
      isCheating: false,
      reason: "An error occurred during cheat detection.",
    };
  }
}

const detectCheatingPrompt = ai.definePrompt({
  name: 'detectCheatingPrompt',
  input: {schema: DetectCheatingInputSchema},
  output: {schema: DetectCheatingOutputSchema},
  prompt: `Sei un'intelligenza artificiale che rileva se un utente sta barando in un quiz usando l'IA per rispondere alle domande.

  Considera il tempo di risposta, il testo della risposta e il testo della domanda per determinare se l'utente sta barando.

  Tempo di risposta: {{responseTime}} secondi
  Testo della risposta: {{answerText}}
  Testo della domanda: {{questionText}}

  Se il tempo di risposta è molto veloce e la risposta è molto completa o complessa, l'utente potrebbe star barando.
  Se il tempo di risposta è ragionevole e la risposta è ragionevole, è probabile che l'utente non stia barando.

  Restituisci un oggetto JSON con un booleano isCheating e una stringa reason.
  `,
});

const detectCheatingFlow = ai.defineFlow(
  {
    name: 'detectCheatingFlow',
    inputSchema: DetectCheatingInputSchema,
    outputSchema: DetectCheatingOutputSchema,
  },
  async input => {
    const {output} = await detectCheatingPrompt(input);
    return output!;
  }
);
