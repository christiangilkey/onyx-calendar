package com.onyxcalendar.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Finds the wake phrase ("Hey Claude") in what the phone heard, and what was said after it. The
 * words come from offline speech recognition, which often hears a name as a word that sounds like
 * it ("hey cloud", "hey clyde"), so each word of the phrase is matched by how it sounds (Soundex)
 * as well as by its letters.
 */
final class VoiceWake {
    private VoiceWake() {}

    static final String DEFAULT = "hey claude";
    // Ways the first word is often heard.
    private static final Set<String> GREETINGS = new HashSet<>(Arrays.asList("hey", "hay", "hi", "hei", "heh", "okay", "ok"));
    // Said on its own after the phrase: nothing to add.
    private static final Set<String> FILLER = new HashSet<>(Arrays.asList("um", "uh", "er", "erm", "hmm", "the", "a", "an", "and", "so", "oh", "huh"));
    private static final Set<String> CANCEL = new HashSet<>(Arrays.asList("cancel", "never mind", "nevermind", "nothing", "stop", "forget it", "no"));

    static List<String> words(String text) {
        List<String> out = new ArrayList<>();
        if (text == null) return out;
        for (String w : text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}']+")) if (!w.isEmpty()) out.add(w);
        return out;
    }

    /** The phrase's words, cleaned; the default when it has none. */
    static List<String> phrase(String p) {
        List<String> w = words(p);
        return w.isEmpty() ? words(DEFAULT) : w;
    }

    // The phrase starts what is said (one stray word before it allowed: an "uh", a word from the room),
    // so "they said hey Claude was great" in a conversation doesn't make a task.
    private static final int MAX_START = 1;

    /** The index of the first word after the phrase in `heard`, or -1 when it doesn't start with the phrase. */
    static int find(List<String> heard, List<String> phrase) {
        int n = phrase.size();
        for (int i = 0; i <= MAX_START && i + n <= heard.size(); i++) {
            boolean all = true;
            for (int j = 0; j < n && all; j++) all = like(heard.get(i + j), phrase.get(j), j == 0 && n > 1);
            if (all) return i + n;
        }
        return -1;
    }

    static boolean has(String heard, String phrase) {
        return find(words(heard), phrase(phrase)) >= 0;
    }

    /** What was said after the phrase ("" when nothing, or nothing but "um"); null when the phrase isn't there. */
    static String after(String heard, String phrase) {
        List<String> w = words(heard);
        int at = find(w, phrase(phrase));
        if (at < 0) return null;
        return command(w.subList(at, w.size()));
    }

    /** The words as a task: "" when they are only filler. */
    static String command(List<String> w) {
        boolean real = false;
        for (String x : w) if (!FILLER.contains(x)) { real = true; break; }
        return real ? String.join(" ", w).trim() : "";
    }

    static String command(String text) {
        return command(words(text));
    }

    /** "Cancel", "never mind": nothing to add after all. */
    static boolean cancels(String command) {
        return command != null && CANCEL.contains(command.trim().toLowerCase(Locale.ROOT));
    }

    /** One heard word against one word of the phrase. `greeting`: the first of several, where "hi" and "okay" also do. */
    static boolean like(String heard, String want) {
        return like(heard, want, false);
    }

    private static boolean like(String heard, String want, boolean greeting) {
        if (heard.equals(want)) return true;
        if (greeting && GREETINGS.contains(want) && GREETINGS.contains(heard)) return true;
        if (want.length() <= 2) return false; // too short to judge by sound
        int gap = Math.abs(heard.length() - want.length());
        // Sounds alike, and about as long (or, two letters shorter or longer, starts the same: "clod" for "claude", not "cold").
        boolean near = gap <= 1 || (gap == 2 && heard.length() >= 2 && heard.regionMatches(0, want, 0, 2));
        return (near && soundex(heard).equals(soundex(want))) || (want.length() >= 5 && distance(heard, want) <= 1);
    }

    /** American Soundex: words that sound alike get the same four characters ("claude", "cloud", "clyde": C430). */
    static String soundex(String s) {
        String w = s.toUpperCase(Locale.ROOT).replaceAll("[^A-Z]", "");
        if (w.isEmpty()) return "";
        StringBuilder out = new StringBuilder().append(w.charAt(0));
        char last = code(w.charAt(0));
        for (int i = 1; i < w.length() && out.length() < 4; i++) {
            char ch = w.charAt(i), c = code(ch);
            if (c != '0' && c != last) out.append(c);
            if (ch != 'H' && ch != 'W') last = c;
        }
        while (out.length() < 4) out.append('0');
        return out.toString();
    }

    private static char code(char c) {
        switch (c) {
            case 'B': case 'F': case 'P': case 'V': return '1';
            case 'C': case 'G': case 'J': case 'K': case 'Q': case 'S': case 'X': case 'Z': return '2';
            case 'D': case 'T': return '3';
            case 'L': return '4';
            case 'M': case 'N': return '5';
            case 'R': return '6';
            default: return '0';
        }
    }

    private static int distance(String a, String b) {
        int[] prev = new int[b.length() + 1], cur = new int[b.length() + 1];
        for (int j = 0; j <= b.length(); j++) prev[j] = j;
        for (int i = 1; i <= a.length(); i++) {
            cur[0] = i;
            for (int j = 1; j <= b.length(); j++) {
                cur[j] = Math.min(Math.min(cur[j - 1] + 1, prev[j] + 1), prev[j - 1] + (a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1));
            }
            int[] t = prev; prev = cur; cur = t;
        }
        return prev[b.length()];
    }
}
