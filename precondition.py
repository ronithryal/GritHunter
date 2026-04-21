import os
import sys
import json
import urllib.request

def run_gate():
    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        print("Error: Missing PERPLEXITY_API_KEY environment variable.")
        print("Please run: export PERPLEXITY_API_KEY='your_api_key' before running this script.")
        sys.exit(1)

    url = "https://api.perplexity.ai/v1/agent"

    # Agent API uses 'instructions' for system prompt and 'input' for user prompt
    # and supports presets like 'pro-search' (referenced in docs)
    # Relaxed formatting to see if it provides better reasoning/results first
    data = {
        "input": "Find React Native engineers in San Francisco who have shipped apps to the App Store. Provide a list of at least 5 developers with their GitHub handles, a summary of their evidence, and source URLs. Finally, format this as a JSON block with the keys 'developers': [{ 'handle', 'summary', 'urls' }].",
        "preset": "pro-search",
        "instructions": "You are a technical talent research agent. Conduct thorough research. In your final response, ensure you include a valid JSON block containing the developers found.",
    }
    
    encoded_data = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=encoded_data, method="POST")
    req.add_header("Authorization", f"Bearer {api_key}")
    req.add_header("Content-Type", "application/json")

    print("Calling Perplexity Agent API... (This involves multi-step research)")
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            res_json = json.loads(res_body)
            
            # Collect all text segments across all output steps
            all_text_segments = []
            if "output" in res_json:
                for step in res_json.get("output", []):
                    if step.get("type") == "message":
                        content_list = step.get("content", [])
                        for item in content_list:
                            if item.get("type") == "output_text":
                                all_text_segments.append(item.get("text", ""))
            
            content = "".join(all_text_segments)
            if not content:
                content = res_json.get("output_text", "")
            
            if not content:
                print("Warning: Could not find output text in res_json. Here is the full response:")
                print(json.dumps(res_json, indent=2))
                return

            print("\n================= RAW OUTPUT ==================")
            print(content)
            print("===============================================\n")

            if res_json.get("reasoning"):
                print("Reasoning found (not parsed):", res_json.get("reasoning")[:500], "...")
            
            # JSON markdown fence extraction
            clean_content = content.strip()
            if "```json" in clean_content:
                clean_content = clean_content.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_content:
                clean_content = clean_content.split("```")[1].split("```")[0].strip()
            
            parsed_content = json.loads(clean_content)
            
            print("================== EVALUATOR ==================")
            devs = parsed_content.get("developers", [])
            for idx, dev in enumerate(devs[:5]):
                print(f"\nDeveloper {idx + 1}: {dev.get('handle', 'Unknown')}")
                print(f"Evidence: {dev.get('summary', 'None')}")
                print("Sources:")
                for u in dev.get("urls", []):
                    print(f"  - {u}")
                print("\nIndependently verifiable? [ ]")
                
            print("\n>>> MANUAL CHECK: Do at least 3 of these 5 have independently verifiable URLs?")
    except Exception as e:
        print(f"\n[!] Error during execution: {e}")
        if hasattr(e, "read"):
            print("Response body:", e.read().decode("utf-8"))

if __name__ == "__main__":
    run_gate()
