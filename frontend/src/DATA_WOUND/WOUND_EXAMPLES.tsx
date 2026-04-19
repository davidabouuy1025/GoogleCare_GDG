export const WOUND_EXAMPLES = [
    {
        title: 'Surgical Incision',
        url: 'https://images.unsplash.com/photo-1584515933487-779824d29309?auto=format&fit=crop&q=80&w=400',
        description: 'Post-operative healing check',
        badge: 'Post-Op',
        badgeColor: 'bg-blue-100 text-blue-700',
        info: {
            what: 'A clean, surgical cut closed with stitches or staples. It heals in layers from the inside out, eventually fading from a pink line to a pale scar.',
            todo: [
                'Keep dry for the first 48 hours.',
                'Change dressings with clean hands only.',
                'Do not pull at stitches or staples.',
                'Avoid stretching the area to prevent opening.',
                'Apply sunscreen once healed to prevent scarring.'
            ],
            urgency: 'Seek help if the wound splits open or bleeds heavily.',
            urgencyLevel: 'moderate',
        },
    },
    {
        title: 'Minor Burn',
        url: 'https://upload.wikimedia.org/wikipedia/commons/8/87/Hand2ndburn.jpg',
        description: 'Second-degree burn assessment',
        badge: '2nd Degree',
        badgeColor: 'bg-orange-100 text-orange-700',
        info: {
            what: 'Damage to skin layers. 1st degree is red/painful; 2nd degree has blisters and a shiny appearance. Usually heals in 1–3 weeks.',
            todo: [
                'Run under cool (not ice) water for 10–20 mins.',
                'Do NOT use butter, toothpaste, or ice.',
                'Never pop blisters; they prevent infection.',
                'Cover loosely with a non-stick bandage.',
                'Use aloe vera once the heat has subsided.'
            ],
            urgency: 'See a doctor if the burn is on the face, hands, or larger than your palm.',
            urgencyLevel: 'high',
        },
    },
    {
        title: 'Skin Ulcer',
        url: 'https://skinkraft.com/cdn/shop/articles/Evidence-Based_93b65bc7-4f8f-4109-a218-d37fc00d93c6_1024x1024.jpg?v=1606210364',
        description: 'Chronic wound monitoring',
        badge: 'Chronic',
        badgeColor: 'bg-yellow-100 text-yellow-700',
        info: {
            what: 'Bacteria have overwhelmed the wound. Signs include spreading redness, warmth, pus, foul odor, or fever.',
            todo: [
                'Do NOT squeeze or drain pus.',
                'See a doctor immediately for antibiotics.',
                'Complete the full antibiotic course.',
                'Keep the area elevated and rested.',
                'Avoid soaking in water (baths/pools).'
            ],
            urgency: 'Go to A&E for red streaks, high fever, or confusion.',
            urgencyLevel: 'high',
        },
    },
    {
        title: 'Skin Cut',
        url: 'https://firstaidcoursesdarwin.com.au/wp-content/uploads/2022/05/Capture-1.png',
        description: 'Superficial laceration care',
        badge: 'Laceration',
        badgeColor: 'bg-red-100 text-red-700',
        info: {
            what: 'A skin break caused by sharp objects or impact. Minor cuts are shallow and heal in 5–10 days. Deep cuts may damage nerves or vessels.',
            todo: [
                'Press firmly with a clean cloth for 5–10 mins to stop bleeding.',
                'Rinse under running water for 5 mins to remove debris.',
                'Wash surrounding skin with mild soap (keep soap out of the cut).',
                'Apply antiseptic and cover with a clean bandage.',
                'Change dressing daily or if it gets wet/dirty.',
                'Check if you need a Tetanus shot booster.'
            ],
            urgency: 'Seek care if the cut is gaping, deep, or won’t stop bleeding after 10 mins.',
            urgencyLevel: 'moderate',
        },
    },
    {
        title: 'Wound Infection',
        url: 'https://heartandhealth.com/wp-content/uploads/2024/11/Untitled-19-1080x438.jpeg',
        description: 'Signs of bacterial infection',
        badge: 'Infected',
        badgeColor: 'bg-rose-100 text-rose-700',
        info: {
            what: 'Bacteria invading a wound. Watch for spreading redness, warmth, swelling, pus, or foul odor.',
            todo: [
                'Do NOT squeeze or drain pus yourself.',
                'See a doctor immediately; you likely need antibiotics.',
                'Finish the entire antibiotic course, even if it looks better.',
                'Keep covered with a sterile dressing.',
                'Elevate the limb to reduce swelling and pain.'
            ],
            urgency: 'Go to A&E for high fever, confusion, or red streaks spreading from the wound.',
            urgencyLevel: 'high',
        },
    },
    {
        title: 'Contusion',
        url: 'https://images.medicinenet.com/images/article/main_image/contusion-vs-hematoma.jpg?output-quality=75',
        description: 'Bruise and blunt trauma',
        badge: 'Bruise',
        badgeColor: 'bg-violet-100 text-violet-700',
        info: {
            what: 'A bruise caused by blunt impact. Blood pools under the skin, changing from purple to green/yellow as it heals over 1–2 weeks.',
            todo: [
                'Ice the area (wrapped in cloth) for 15 mins every 2 hours.',
                'Elevate the area above heart level to limit swelling.',
                'Avoid aspirin for the first 24 hours (it can increase bruising).',
                'After 48 hours, use warm compresses to speed up healing.',
                'Apply arnica gel to reduce discolouration.'
            ],
            urgency: 'See a doctor if the pain is extreme or the bruise doesn’t fade after 2 weeks.',
            urgencyLevel: 'low',
        },
    },
];