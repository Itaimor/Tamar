# 🚀 Gemini API Setup Guide

Welcome to **Project Tamar**! To get the AI Health Assistant running locally, you'll need to set up your own Google Gemini API key. This guide will walk you through the process in under 5 minutes.

---

## 🛡️ Security First

> [!IMPORTANT]
> **Your API key is a secret.**
> * **Never** share it with anyone or post it in public channels.
> * **Never** commit it to GitHub.
> * **Always** ensure your `.env` file is ignored by Git.

---

## 📍 Step 1: Generate Your API Key

1.  Navigate to [Google AI Studio](https://aistudio.google.com/).
2.  Sign in with your Google account.
3.  In the left-hand sidebar, click on **"Get API key"**.
4.  Select **"Create API key in new project"**.
5.  **Copy** the generated key immediately. 

---

## ⚙️ Step 2: Configure Your Environment

The project uses a `.env` file to manage secrets securely.

1.  In the **root directory** of the project, check if a `.env` file exists.
2.  If it doesn't, create one: `touch .env` (or right-click > New File).
3.  Add your key to the file using this exact variable name:
    ```env
    VITE_GEMINI_TAMAR_API_KEY=YOUR_PASTE_KEY_HERE
    ```
    > [!TIP]
    > We use the `VITE_` prefix so the key is accessible within our Vite-powered frontend.

4.  **Verify Git Protection:** Open `.gitignore` and ensure `.env` is listed to prevent accidental leaks.

---

## 🧪 Step 3: Verify Your Connection

You can test if your key is active using the project's own stack.

### TypeScript / Vite (Project Stack)
This project uses the `@google/generative-ai` library. Once you've added the key to `.env`, start the development server:

```bash
npm run dev
```

If the key is missing or invalid, **Tamar** will show a toast notification in the UI:
> "Gemini API key is missing or invalid. Please check your .env file."

### Quick Python Test (Optional)
If you want to verify the key's validity independently in your terminal:

```python
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
api_key = os.getenv("VITE_GEMINI_TAMAR_API_KEY")

if not api_key:
    print("❌ Error: VITE_GEMINI_TAMAR_API_KEY not found in .env")
else:
    genai.configure(api_key=api_key)
    # Using the project's preferred model
    model = genai.GenerativeModel('gemini-3.1-flash-lite')
    try:
        response = model.generate_content("Testing. Reply with 'Success!'")
        print(f"✅ Status: {response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")
```

---

## 🛠️ Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **403 Forbidden** | Your API key might be restricted by region. Ensure you are in a [supported country](https://ai.google.dev/available_regions). |
| **API Key Not Found** | Double-check that your `.env` file is in the **root** folder and not inside `src/`. |
| **Model Not Found** | Ensure you are using `gemini-3.1-flash-lite` or check AI Studio for available models in your tier. |
| **Vite Variable Undefined** | Ensure the variable starts with `VITE_` and you have restarted the dev server (`npm run dev`) after editing `.env`. |

---

> [!NOTE]
> If you run into any other issues, please reach out to the project team. Happy coding! 🚀