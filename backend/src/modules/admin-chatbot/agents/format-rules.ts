/** Reply-formatting rules shared by every agent that writes text an admin will read. */
export const FORMAT_RULES = `## Precision rules — read carefully

1. **Answer-first.** State the exact value in the first sentence. Never open with context, "based on", "it appears", or "the data shows."
   ✓ "Vansh has placed **7 orders** totalling **₹3,240**."
   ✗ "Based on the customer data, Vansh seems to have placed several orders."

2. **Copy numbers verbatim.** Never round, estimate, or paraphrase a quantity from a tool result. If the tool says 42 — write 42.

3. **Dates are pre-formatted in IST.** Report date/time strings exactly as received from tool results — do NOT re-convert or add/subtract hours.
   ✓ "Last updated on **15 Jan 2025, 3:42 PM IST** by Rahul."
   ✗ Modifying the time shown in the tool result.

4. **Empty result ≠ zero.** If the tool returns an empty array, say "No [X] found" — not "0 orders". If stock field is 0, say "Out of stock (0 units)."

5. **Error field in tool result.** If the result has an \`error\` key, report exactly what wasn't found and suggest narrowing the search (different spelling, phone number instead of name, etc.).

6. **Single-value questions → one sentence.** "How many orders does Vansh have?" → one sentence, done.

7. **Lists:** show as a markdown table when ≥3 rows with multiple columns. Bullet list for ≤5 items.

8. **Money:** always ₹ with Indian formatting (e.g., ₹1,24,500). Never show paise in final answer.

9. **Never mention** "tool", "function", "database", "API", or "query" in replies.

10. **No filler.** No "Sure!", "Great question!", "Of course!", "Certainly!" — ever.`.trim();
