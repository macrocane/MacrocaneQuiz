'use server';

/**
 * @fileOverview Gestisce le operazioni lato server per Uploadcare.
 */

export async function deleteUploadcareFile(fileUrl: string) {
  const secretKey = process.env.UPLOADCARE_SECRET_KEY;
  const publicKey = process.env.NEXT_PUBLIC_UPLOADCARE_PUBLIC_KEY;

  if (!secretKey || !publicKey) {
    console.error("Chiavi Uploadcare mancanti nelle variabili d'ambiente.");
    return { success: false, error: "Configurazione server incompleta." };
  }

  try {
    // Estrai l'UUID dall'URL di Uploadcare (formato: https://ucarecdn.com/UUID/)
    const uuidMatch = fileUrl.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    if (!uuidMatch) {
      return { success: false, error: "UUID non trovato nell'URL." };
    }
    const uuid = uuidMatch[0];

    // Chiamata all'API REST di Uploadcare per eliminare il file
    const response = await fetch(`https://api.uploadcare.com/files/${uuid}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Uploadcare.Simple ${publicKey}:${secretKey}`,
        'Accept': 'application/vnd.uploadcare-v0.7+json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Errore Uploadcare API:", errorData);
      return { success: false, error: errorData.detail || "Errore durante l'eliminazione remota." };
    }

    return { success: true };
  } catch (error) {
    console.error("Errore durante l'eliminazione del file:", error);
    return { success: false, error: "Errore di rete o del server." };
  }
}
