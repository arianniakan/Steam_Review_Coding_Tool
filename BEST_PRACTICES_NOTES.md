# Best Practices for Text Annotation with LLMs — Usage Notes

Source: Törnberg, P. (2024) "Best Practices for Text Annotation with Large Language Models."

These are considerations to keep in mind when *using* the app, or one-time documentation/decisions to write into the README — not things that need a UI feature. The in-app implementation plan lives in [BEST_PRACTICES_TODO.md](BEST_PRACTICES_TODO.md).

## 1. Choose an appropriate model

- Write an explicit model-choice justification into the README covering the paper's 6 factors: reproducibility, ethics/legality, transparency, language support, scalability, task complexity.
- Document the known trade-off explicitly: OpenAI models fail the "open-source, training data known" bar the paper prefers — note this as an accepted cost/ease vs. transparency trade-off, not an oversight.
- Be aware that gpt-4o-mini is English-centric per the paper's warning — if a research project's review corpus spans several languages, treat non-English results with more scrutiny (the per-language reliability breakdown planned in the TODO list will help surface this quantitatively, but the awareness itself is a usage consideration).

## 7. Ethical and legal implications

- Document the data-processing chain explicitly in the README: Steam review text is sent to OpenAI's API for both suggestion routes. No reviewer username or Steam ID is stored or forwarded — this is already true in practice, just worth stating explicitly as a data-minimization note.
- Add a note on OpenAI's DPA / data-usage policy for API traffic specifically: API traffic is excluded from training by default (unlike the ChatGPT web app), but this should be confirmed against OpenAI's current terms before stating it as fact, not assumed.
- Acknowledge the "changing expectations of privacy in public posts" point from the paper: Steam reviews are public, but authors likely didn't anticipate LLM-scale extraction when they wrote them. Worth a line in the README's ethics section.
- Review Steam's Terms of Service regarding sending review text to a third-party API for processing — a one-time legal check, not a software feature.

## 9. Consider that your data might be in the training data

- Steam reviews are not a public labeled dataset (freeform, unlabeled text), so the paper's main warning here (don't validate against memorized datasets like the Manifesto Project) doesn't directly apply — worth stating this reasoning explicitly in the README rather than leaving it unaddressed.
- Keep in mind the model's training cutoff vs. review dates as a soft caveat — e.g. gpt-4o-mini's knowledge cutoff vs. a game's most recent patches/controversies could affect how well it contextualizes very recent reviews referencing current events in the game's community.
