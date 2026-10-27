"""Clean up a speech-to-text transcript without dropping or adding words.

Candidates spell acronyms aloud ("J S O N", "S Q L", "A P I"). Speech
engines write those as separate letters or as look-alike words
("jason", "jay son"). This module turns them back into the written form
("JSON", "SQL", "API") and fixes the casing of common data / tech terms.
It never removes or re-orders spoken words.
"""

import re

ACRONYMS = {
    "json", "sql", "api", "kpi", "kpis", "etl", "csv", "xml", "yaml",
    "html", "css", "http", "https", "url", "pdf", "aws", "gcp", "ai",
    "ml", "nlp", "sdk", "ui", "ux", "crud", "rest", "ide", "cpu",
    "gpu", "bi", "eda", "ci", "cd", "ssl", "tls", "dns", "sso",
    "oauth", "jwt", "orm", "oop", "dbms", "rdbms", "olap", "oltp",
    "nosql", "roi", "sla", "mvp", "pca", "svm", "knn", "rnn", "cnn",
    "llm", "gpt", "rpa", "erp", "crm", "sap", "iot", "vpn", "ssh",
}

# words whose correct written form is not simply UPPER-CASE
SPECIAL_CASE = {
    "python": "Python",
    "pandas": "pandas",
    "numpy": "NumPy",
    "scipy": "SciPy",
    "matplotlib": "Matplotlib",
    "seaborn": "Seaborn",
    "tableau": "Tableau",
    "excel": "Excel",
    "mysql": "MySQL",
    "postgresql": "PostgreSQL",
    "postgres": "Postgres",
    "mongodb": "MongoDB",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "github": "GitHub",
    "tensorflow": "TensorFlow",
    "pytorch": "PyTorch",
    "scikit-learn": "scikit-learn",
    "pyspark": "PySpark",
    "hadoop": "Hadoop",
    "snowflake": "Snowflake",
    "react": "React",
    "fastapi": "FastAPI",
    "oauth": "OAuth",
    "nosql": "NoSQL",
}

# multi-word spoken forms -> written form
PHRASES = [
    (re.compile(r"\bpower\s+b\.?\s*i\.?\b", re.I), "Power BI"),
    (re.compile(r"\bmy\s+sequel\b", re.I), "MySQL"),
    (re.compile(r"\bpost\s*gres\s*sequel\b", re.I), "PostgreSQL"),
    (re.compile(r"\bj\.?\s*son\b", re.I), "JSON"),
    (re.compile(r"\bjay\s*son\b", re.I), "JSON"),
    (re.compile(r"\bk\.?\s*p\.?\s*is\b", re.I), "KPIs"),
]

# "jason" is also a first name, so only treat it as JSON in a data context
_JASON_AFTER = (
    r"file|files|format|data|object|objects|response|responses|parsing|"
    r"string|array|schema|document|documents|key|keys|payload|payloads|"
    r"output|input|body"
)
_JASON_BEFORE = (
    r"parse|parsing|parsed|load|loading|loaded|read|reading|convert|"
    r"converting|serialize|serializing|dump|dumping|export|exporting"
)
_JASON_AFTER_SET = frozenset(_JASON_AFTER.split("|"))
_JASON_BEFORE_SET = frozenset(_JASON_BEFORE.split("|"))
_JASON_WORD = re.compile(
    r"(?P<prev>\b[A-Za-z]+\s+)?\bjason\b(?P<next>\s+[A-Za-z]+)?",
    re.I,
)


def _fix_jason(text: str) -> str:
    def repl(match: re.Match) -> str:
        prev = (match.group("prev") or "").strip().lower()
        nxt = (match.group("next") or "").strip().lower()

        is_data = (
            nxt in _JASON_AFTER_SET
            or prev in _JASON_BEFORE_SET
            or (prev == "in" and nxt in {"format", ""})
        )

        if not is_data:
            return match.group(0)

        return (
            (match.group("prev") or "")
            + "JSON"
            + (match.group("next") or "")
        )

    return _JASON_WORD.sub(repl, text)


_TOKEN = re.compile(r"\S+")
_SINGLE_LETTER = re.compile(r"^([A-Za-z])[.,]?$")


def _join_spelled_letters(text: str) -> str:
    """'j s o n' / 'J. S. O. N.' / 'is q l' -> 'JSON' / 'JSON' / 'is SQL'."""
    tokens = _TOKEN.findall(text)
    out: list[str] = []
    i = 0

    while i < len(tokens):
        match_len = 0
        match_word = ""

        # try the longest run of single letters starting here
        j = i
        letters = []
        while j < len(tokens) and len(letters) < 6:
            m = _SINGLE_LETTER.match(tokens[j])
            if not m:
                break
            letters.append(m.group(1))
            j += 1
            joined = "".join(letters).lower()
            if len(letters) >= 2 and joined in ACRONYMS:
                match_len = len(letters)
                match_word = joined.upper()

        if match_len:
            trailing = ""
            last = tokens[i + match_len - 1]
            if last[-1] in ".,":
                trailing = last[-1]
            out.append(match_word + trailing)
            i += match_len
        else:
            out.append(tokens[i])
            i += 1

    return " ".join(out)


def _fix_word_case(text: str) -> str:
    def repl(match: re.Match) -> str:
        word = match.group(0)
        low = word.lower()

        if low in SPECIAL_CASE:
            return SPECIAL_CASE[low]
        if low in ACRONYMS:
            return low.upper() if low != "kpis" else "KPIs"
        return word

    return re.sub(r"[A-Za-z][A-Za-z\-]*", repl, text)


def normalize_transcript(text: str) -> str:
    if not text:
        return ""

    result = " ".join(text.split())

    result = _join_spelled_letters(result)

    for pattern, replacement in PHRASES:
        result = pattern.sub(replacement, result)

    result = _fix_jason(result)
    result = _fix_word_case(result)

    return result.strip()
