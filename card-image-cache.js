import { supabase } from './supabaseClient.js';

const BUCKET = 'card-images';

export async function resolveCardImage(tcgdexImageUrl, cardId, cardName, setName) {
    if (!tcgdexImageUrl || !cardId) return tcgdexImageUrl;

    const filename = `${cardId.replace(/[^a-zA-Z0-9-_.]/g, '_')}.png`;

    // Check if manually uploaded to Supabase Storage
    try {
        const { data: existing } = await supabase.storage
            .from(BUCKET)
            .list('', { search: filename });

        if (existing && existing.length > 0) {
            const { data: urlData } = supabase.storage
                .from(BUCKET)
                .getPublicUrl(filename);
            return urlData.publicUrl; // ← serve from Supabase
        }
    } catch (err) {
        // fall through to TCGDex
    }

    // Not in cache — use TCGDex directly
    return `${tcgdexImageUrl}/high.png`;
}

export async function resolveCardImages(cards) {
    return Promise.all(
        cards.map(async card => {
            if (!card.image) return card;
            const resolvedUrl = await resolveCardImage(
                card.image, card.id, card.name, card.setName
            );
            return { ...card, image: resolvedUrl };
        })
    );
}