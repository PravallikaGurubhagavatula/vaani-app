from translation_pipeline import translate_pipeline

tests = [
    "samj hua kya",
    "bagunnava",
    "enna panra",
    "nuvvu ekkada",
    "hello bro",
    "namaskaram",
    "kya kar raha hai",
    "meeru ekkada unnaru",
]

for text in tests:
    result = translate_pipeline(text, target_language="en")

    print("\n==============================")
    print("INPUT:", text)
    print("DETECTED:", result.source_language)
    print("TRANSLITERATED:", result.transliterated)
    print("TRANSLATED:", result.translated)
    print("CONFIDENCE:", result.confidence)
