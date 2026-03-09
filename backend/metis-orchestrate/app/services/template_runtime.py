import ast
import json
import re
from dataclasses import dataclass
from typing import Any


TOKEN_RE = re.compile(r"\{\{\s*(.*?)\s*\}\}")
FULL_TOKEN_RE = re.compile(r"^\s*\{\{\s*(.*?)\s*\}\}\s*$")
HELPER_RE = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\((.*)\))?$")
HELPER_COLON_RE = re.compile(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*:(.*)$")


@dataclass
class LookupResult:
    value: Any
    found: bool


@dataclass
class RenderResult:
    value: Any
    missing_variables: list[str]
    used_variables: list[str]


def _split_pipeline(expression: str) -> list[str]:
    return [part.strip() for part in expression.split("|") if part.strip()]


def _parse_reference(value: str) -> tuple[str, list[Any]]:
    value = value.strip()
    if not value:
        return "", []

    idx = 0
    while idx < len(value) and value[idx] not in ".[":
        idx += 1
    root_key = value[:idx]
    remainder = value[idx:]
    tokens: list[Any] = []
    i = 0
    while i < len(remainder):
        char = remainder[i]
        if char == ".":
            i += 1
            start = i
            while i < len(remainder) and remainder[i] not in ".[":
                i += 1
            key = remainder[start:i]
            if key:
                tokens.append(key)
            continue
        if char == "[":
            end = remainder.find("]", i)
            if end == -1:
                raise ValueError(f"Invalid token reference: {value}")
            raw = remainder[i + 1 : end].strip()
            if (raw.startswith('"') and raw.endswith('"')) or (
                raw.startswith("'") and raw.endswith("'")
            ):
                tokens.append(raw[1:-1])
            elif raw.isdigit():
                tokens.append(int(raw))
            else:
                tokens.append(raw)
            i = end + 1
            continue
        start = i
        while i < len(remainder) and remainder[i] not in ".[":
            i += 1
        key = remainder[start:i]
        if key:
            tokens.append(key)
    return root_key, tokens


def lookup_reference(expression: str, context: dict[str, Any]) -> LookupResult:
    root_key, tokens = _parse_reference(expression)
    if not root_key or root_key not in context:
        return LookupResult(value=None, found=False)

    value: Any = context.get(root_key)
    for token in tokens:
        if isinstance(token, int):
            if isinstance(value, list) and 0 <= token < len(value):
                value = value[token]
                continue
            return LookupResult(value=None, found=False)
        if isinstance(value, dict) and token in value:
            value = value.get(token)
            continue
        return LookupResult(value=None, found=False)
    return LookupResult(value=value, found=True)


def _parse_helper_args(raw_args: str, context: dict[str, Any]) -> list[Any]:
    if not raw_args:
        return []
    normalized = raw_args.strip()
    if normalized.startswith(":"):
        normalized = normalized[1:].strip()
    try:
        parsed = ast.literal_eval(f"[{normalized}]")
    except Exception:
        parsed = [normalized]

    resolved: list[Any] = []
    for arg in parsed:
        if isinstance(arg, str):
            token_match = FULL_TOKEN_RE.match(arg)
            if token_match:
                resolved.append(evaluate_expression(token_match.group(1), context).value)
                continue
            reference_lookup = lookup_reference(arg, context)
            if reference_lookup.found:
                resolved.append(reference_lookup.value)
                continue
            resolved.append(arg)
        else:
            resolved.append(arg)
    return resolved


def _apply_helper(name: str, value: Any, args: list[Any], found: bool) -> tuple[Any, bool]:
    helper = name.lower()
    if helper == "default":
        if value in (None, "", [], {}) or not found:
            return (args[0] if args else value), True
        return value, found
    if helper == "concat":
        pieces = ["" if value is None else str(value)] + [str(arg) for arg in args]
        return "".join(pieces), True
    if helper == "upper":
        return str(value or "").upper(), True
    if helper == "lower":
        return str(value or "").lower(), True
    if helper == "trim":
        return str(value or "").strip(), True
    if helper == "json":
        return json.dumps(value), True
    return value, found


def evaluate_expression(expression: str, context: dict[str, Any]) -> RenderResult:
    pipeline = _split_pipeline(expression)
    if not pipeline:
        return RenderResult(value=None, missing_variables=[], used_variables=[])

    lookup = lookup_reference(pipeline[0], context)
    value = lookup.value
    found = lookup.found

    for part in pipeline[1:]:
        helper_name = ""
        raw_args = ""
        colon_match = HELPER_COLON_RE.match(part)
        if colon_match:
            helper_name = colon_match.group(1)
            raw_args = colon_match.group(2)
        else:
            match = HELPER_RE.match(part)
            if not match:
                continue
            helper_name = match.group(1)
            raw_args = match.group(2) or ""
        helper_args = _parse_helper_args(raw_args, context)
        value, found = _apply_helper(helper_name, value, helper_args, found)

    missing = [] if found else [pipeline[0]]
    return RenderResult(value=value, missing_variables=missing, used_variables=[pipeline[0]])


def render_template_string(value: str, context: dict[str, Any]) -> RenderResult:
    full = FULL_TOKEN_RE.match(value)
    if full:
        return evaluate_expression(full.group(1), context)

    missing_variables: list[str] = []
    used_variables: list[str] = []

    def _replace(match: re.Match[str]) -> str:
        result = evaluate_expression(match.group(1), context)
        missing_variables.extend(result.missing_variables)
        used_variables.extend(result.used_variables)
        if result.value is None:
            return ""
        if isinstance(result.value, (dict, list)):
            return json.dumps(result.value)
        return str(result.value)

    rendered = TOKEN_RE.sub(_replace, value)
    return RenderResult(
        value=rendered,
        missing_variables=missing_variables,
        used_variables=used_variables,
    )


def render_payload(payload: Any, context: dict[str, Any]) -> RenderResult:
    if isinstance(payload, dict):
        resolved: dict[str, Any] = {}
        missing: list[str] = []
        used: list[str] = []
        for key, value in payload.items():
            result = render_payload(value, context)
            resolved[key] = result.value
            missing.extend(result.missing_variables)
            used.extend(result.used_variables)
        return RenderResult(value=resolved, missing_variables=missing, used_variables=used)

    if isinstance(payload, list):
        resolved_items: list[Any] = []
        missing: list[str] = []
        used: list[str] = []
        for item in payload:
            result = render_payload(item, context)
            resolved_items.append(result.value)
            missing.extend(result.missing_variables)
            used.extend(result.used_variables)
        return RenderResult(value=resolved_items, missing_variables=missing, used_variables=used)

    if isinstance(payload, str):
        return render_template_string(payload, context)

    return RenderResult(value=payload, missing_variables=[], used_variables=[])


def unique_values(values: list[str]) -> list[str]:
    unique: list[str] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        unique.append(value)
    return unique
