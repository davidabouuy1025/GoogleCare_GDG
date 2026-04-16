export function isUnsafeInput(input: string): boolean {
    const text = input.toLowerCase();

    const patterns = [
        // 🔓 Prompt injection / jailbreak
        /ignore.*(instruction|rule|previous)/i,
        /bypass|override|disable.*(safety|filter|restriction)/i,
        /developer mode|debug mode|system prompt/i,
        /act as.*(doctor|medical professional|expert)/i,
        /pretend.*(doctor|professional)/i,

        // ⚠️ Forced diagnosis / certainty
        /exact diagnosis/i,
        /what.*disease.*i have/i,
        /tell me exactly/i,
        /100%|guarantee|certain|definitely/i,
        /confirm.*i have/i,

        // 💀 Self-harm / suicide
        /kill myself|suicide|end my life/i,
        /want to die|don'?t want to live/i,
        /overdose|od on/i,
        /harm myself|self harm/i,

        // 💊 Drug misuse / overdose
        /how many.*(pill|tablet|mg).*(too much|overdose)/i,
        /double dose|extra dose/i,
        /max dose.*safe/i,
        /mix.*alcohol.*medicine/i,
        /get high.*medicine/i,

        // 🧪 Dangerous medical actions
        /home surgery|do surgery myself/i,
        /remove.*(wound|infection).*myself/i,
        /cut.*open/i,
        /inject myself/i,
        /drain.*(pus|infection)/i,

        // 🧨 Liability traps
        /guarantee.*safe/i,
        /promise.*safe/i,
        /you.*responsible/i,
        /no doctor needed/i,

        // 🔍 Adversarial / trick prompts
        /hypothetically.*ignore/i,
        /for testing.*ignore/i,
        /just answer.*no rules/i,
        /fictional.*but real answer/i,

        // 🚫 Extreme negligence
        /don'?t want doctor/i,
        /avoid doctor/i,
        /refuse treatment/i
    ];

    return patterns.some((pattern) => pattern.test(text));
}