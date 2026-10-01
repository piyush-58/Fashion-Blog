import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OutfitModel from "../models/Outfit.js";
import WardrobeModel from "../models/Wardrobe.js";
import UserModel from "../models/User.js";

const router = express.Router();

// Initialize Gemini AI with error handling
const initGemini = () => {
  try {
    if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your_key_here") {
      return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  } catch (err) {
    console.warn("⚠️  Gemini initialization failed");
  }
  return null;
};

const genAI = initGemini();

/* =====================
   GENERATE OUTFIT IMAGES
===================== */

// ✅ Validate image prompt for HuggingFace
function validateAndOptimizePrompt(prompt) {
  if (!prompt || typeof prompt !== "string") {
    return "A stylish person wearing fashionable outfit, full body, realistic fashion photography, clean background, professional lighting";
  }

  // Clean up the prompt
  let optimized = prompt.trim();

  // Ensure minimum length
  if (optimized.length < 20) {
    optimized = `${optimized}, realistic fashion photography, full body, clean background`;
  }

  // Ensure it doesn't exceed HuggingFace limits (~77 tokens)
  if (optimized.length > 400) {
    optimized = optimized.substring(0, 400);
  }

  // Add essential keywords if missing
  if (!optimized.toLowerCase().includes("fashion")) {
    optimized += ", fashion photography";
  }
  if (!optimized.toLowerCase().includes("full body")) {
    optimized += ", full body";
  }
  if (!optimized.toLowerCase().includes("clean background")) {
    optimized += ", clean background";
  }

  console.log("📝 Optimized prompt for HuggingFace:", optimized);
  return optimized;
}

async function generateOutfitImage(imagePrompt) {
  try {
    // Validate and optimize the prompt
    const validatedPrompt = validateAndOptimizePrompt(imagePrompt);

    // Try HuggingFace first if API key exists
    if (process.env.HF_API_KEY) {
      try {
        console.log("🎨 Generating image with HuggingFace FLUX.1-dev...");

        const response = await fetch(
          "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-dev",
          {
            headers: {
              Authorization: `Bearer ${process.env.HF_API_KEY}`,
              "Content-Type": "application/json"
            },
            method: "POST",
            body: JSON.stringify({
              inputs: validatedPrompt,
              parameters: {
                guidance_scale: 7.5,
                num_inference_steps: 25
              }
            }),
            timeout: 60000, // Increased timeout for image generation
          }
        );

        if (response.ok) {
          const blob = await response.blob();
          const buffer = Buffer.from(await blob.arrayBuffer());
          const base64 = buffer.toString("base64");
          console.log("✅ HuggingFace image generated successfully");
          return `data:image/jpeg;base64,${base64}`;
        } else {
          const errorText = await response.text();
          console.warn("⚠️  HuggingFace API error:", response.status, errorText);

          // Check if it's a rate limit or model loading issue
          if (response.status === 503 || response.status === 429) {
            console.log("⏳ HuggingFace model loading or rate limited, retrying...");
            // Wait and retry once
            await new Promise(resolve => setTimeout(resolve, 3000));
            return generateOutfitImage(imagePrompt);
          }
        }
      } catch (hfErr) {
        console.warn("⚠️  HuggingFace API error:", hfErr.message);
      }
    } else {
      console.warn("⚠️  HF_API_KEY not configured");
    }

    // Fallback to Unsplash URLs (no API key needed, very reliable)
    console.log("📸 Using Unsplash fallback image");

    // Create a smart search term from the prompt
    let searchTerm = "casual-outfit";
    const prompt_lower = validatedPrompt.toLowerCase();
    if (prompt_lower.includes("formal") || prompt_lower.includes("suit")) searchTerm = "formal-outfit";
    else if (prompt_lower.includes("evening") || prompt_lower.includes("dress")) searchTerm = "evening-dress";
    else if (prompt_lower.includes("work") || prompt_lower.includes("business")) searchTerm = "business-casual";
    else if (prompt_lower.includes("casual")) searchTerm = "casual-outfit";
    else if (prompt_lower.includes("summer")) searchTerm = "summer-outfit";
    else if (prompt_lower.includes("winter")) searchTerm = "winter-outfit";

    return `https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=500&fit=crop`;

  } catch (err) {
    console.error("❌ Image generation error:", err.message);
    // Last resort fallback
    return `https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=500&fit=crop`;
  }
}

/* =====================
   GENERATE OUTFIT SUGGESTIONS WITH OPENROUTER FALLBACK
===================== */

async function generateOutfitsWithOpenRouter(wardrobeSummary, count) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OpenRouter API key not configured");
    }

    const SYSTEM_PROMPT = `You are a professional AI Fashion Stylist + Image Generator.

Your job is to generate COMPLETE outfit suggestions with REALISTIC image prompts for HuggingFace FLUX.1-dev model.

RULES:
1. ALWAYS give a complete look:
   - Top 👕
   - Bottom 👖
   - Shoes 👟
   - Accessories 🧢

2. Match the OCCASION:
   - Casual
   - Formal
   - Work
   - Weekend
   - Evening

3. Consider WEATHER (India hot climate):
   - Prefer cotton, linen for summer
   - Light colors for heat
   - Breathable fabrics

4. VERY IMPORTANT - Generate HuggingFace FLUX.1-dev optimized IMAGE PROMPTS:

Image prompt MUST:
- Start with "A stylish person" or "A professional" or "An elegant"
- Include specific clothing items and colors
- Include "full body shot"
- Include "realistic fashion photography" or "fashion photography style"
- Include "clean background"
- Include "professional lighting"
- Be 50-350 characters long (optimal for FLUX.1-dev)
- Have no special characters or line breaks

FORMAT RESPONSE STRICTLY AS JSON ARRAY:

[
  {
    "title": "Casual Comfort",
    "category": "Casual",
    "description": "White cotton t-shirt with blue jeans and sneakers",
    "items": {
      "top": "White cotton t-shirt",
      "bottom": "Blue slim fit jeans",
      "shoes": "White sneakers",
      "accessory": "Black sunglasses"
    },
    "colors": ["white", "blue", "black"],
    "season": "All Seasons",
    "styleTip": "Perfect everyday look for comfort and style",
    "imagePrompt": "A stylish person wearing white cotton t-shirt, blue jeans, white sneakers, black sunglasses, full body shot, realistic fashion photography, clean background, professional lighting"
  }
]

Generate ${count} DIFFERENT outfits. Keep it modern, trendy, and realistic.
Important: imagePrompt must be valid for HuggingFace FLUX.1-dev image generation.`;

    const prompt = `Based on this wardrobe: ${wardrobeSummary}

${SYSTEM_PROMPT}

Return ONLY the JSON array, no markdown, no extra text.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://fashion-blog-mern-1.onrender.com",
        "X-Title": "StyleVibe Fashion Assistant",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: "You are an expert AI fashion stylist. Always return valid JSON arrays. Never include markdown formatting.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;

    if (!responseText) {
      throw new Error("No response from OpenRouter");
    }

    // Extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error("Failed to extract JSON from response");
    }

    const outfitsData = JSON.parse(jsonMatch[0]);
    console.log(`✅ Generated ${outfitsData.length} outfits using OpenRouter`);
    return outfitsData;
  } catch (err) {
    console.error("❌ OpenRouter outfit generation error:", err.message);
    throw err;
  }
}

router.post("/generate", async (req, res) => {
  try {
    const userId = req.userId;
    const { count = 4 } = req.body;

    // ✅ VALIDATE USER ID
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized - no user ID" });
    }

    // Get user's wardrobe
    const wardrobeItems = await WardrobeModel.find({ userId });

    if (wardrobeItems.length === 0) {
      return res.json({
        outfits: [
          {
            title: "Classic Casual",
            category: "Casual",
            items: {
              top: "White T-Shirt",
              bottom: "Blue Denim",
              shoes: "White Sneakers",
              accessory: "Brown Belt"
            },
            colors: ["white", "blue", "brown"],
            season: "All Seasons",
            styleTip: "A timeless casual look that works for any season",
            image: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&h=500&fit=crop"
          }
        ],
        message: "Add more items to your wardrobe for personalized suggestions"
      });
    }

    // Prepare wardrobe summary
    const wardrobeSummary = wardrobeItems
      .map(item => `${item.name} (${item.category}, ${item.color})`)
      .join(", ");

    let outfitsData = [];

    // Try Gemini first if available
    if (genAI) {
      try {
        const modelNames = ["gemini-1.5-flash", "gemini-pro"];
        let model = null;
        for (const modelName of modelNames) {
          try {
            model = genAI.getGenerativeModel({ model: modelName });
            console.log(`✅ Using Gemini model: ${modelName}`);
            break;
          } catch (err) {
            console.warn(`⚠️  Gemini model ${modelName} not available`);
          }
        }

        if (model) {
          const SYSTEM_PROMPT = `You are a professional AI Fashion Stylist + Image Generator.

Your job is to generate COMPLETE outfit suggestions with REALISTIC image prompts for HuggingFace FLUX.1-dev model.

RULES:
1. ALWAYS give a complete look:
   - Top 👕
   - Bottom 👖
   - Shoes 👟
   - Accessories 🧢

2. Match the OCCASION:
   - Casual
   - Formal
   - Work
   - Weekend
   - Evening

3. Consider WEATHER (India hot climate):
   - Prefer cotton, linen for summer
   - Light colors for heat
   - Breathable fabrics

4. VERY IMPORTANT - Generate HuggingFace FLUX.1-dev optimized IMAGE PROMPTS:

Image prompt MUST:
- Start with "A stylish person" or "A professional" or "An elegant"
- Include specific clothing items and colors
- Include "full body shot"
- Include "realistic fashion photography" or "fashion photography style"
- Include "clean background"
- Include "professional lighting"
- Be 50-350 characters long (optimal for FLUX.1-dev)
- Have no special characters or line breaks

FORMAT RESPONSE STRICTLY AS JSON ARRAY:

[
  {
    "title": "Casual Comfort",
    "category": "Casual",
    "description": "White cotton t-shirt with blue jeans and sneakers",
    "items": {
      "top": "White cotton t-shirt",
      "bottom": "Blue slim fit jeans",
      "shoes": "White sneakers",
      "accessory": "Black sunglasses"
    },
    "colors": ["white", "blue", "black"],
    "season": "All Seasons",
    "styleTip": "Perfect everyday look for comfort and style",
    "imagePrompt": "A stylish person wearing white cotton t-shirt, blue jeans, white sneakers, black sunglasses, full body shot, realistic fashion photography, clean background, professional lighting"
  }
]

Generate ${count} DIFFERENT outfits. Keep it modern, trendy, and realistic.`;

          const prompt = `Based on this wardrobe: ${wardrobeSummary}

${SYSTEM_PROMPT}

Return ONLY the JSON array, no markdown, no extra text.`;

          const result = await model.generateContent(prompt);
          const responseText = result.response.text();
          const jsonMatch = responseText.match(/\[[\s\S]*\]/);

          if (jsonMatch) {
            outfitsData = JSON.parse(jsonMatch[0]);
            console.log("✅ Outfits generated using Gemini AI");
          }
        }
      } catch (err) {
        console.warn("⚠️  Gemini generation failed, trying OpenRouter...", err.message);
      }
    }

    // Fallback to OpenRouter if Gemini failed or unavailable
    if (!Array.isArray(outfitsData) || outfitsData.length === 0) {
      try {
        outfitsData = await generateOutfitsWithOpenRouter(wardrobeSummary, count);
      } catch (err) {
        console.warn("⚠️  OpenRouter also failed, using default outfits");
        outfitsData = [];
      }
    }

    // If all AI generation failed, use default outfits
    if (!Array.isArray(outfitsData) || outfitsData.length === 0) {
      outfitsData = [
        {
          title: "Casual Comfort",
          category: "Casual",
          items: { top: "White Cotton T-Shirt", bottom: "Blue Jeans", shoes: "White Sneakers", accessory: "Black Sunglasses" },
          colors: ["white", "blue", "black"],
          season: "All Seasons",
          styleTip: "Perfect everyday look for comfort and style",
          imagePrompt: "A stylish person wearing white cotton t-shirt, blue jeans, white sneakers, black sunglasses, full body shot, realistic fashion photography, clean background, professional lighting"
        },
        {
          title: "Work Ready",
          category: "Work",
          items: { top: "White Blouse", bottom: "Black Trousers", shoes: "Black Flats", accessory: "Blazer" },
          colors: ["white", "black"],
          season: "All Seasons",
          styleTip: "Professional and polished for the office",
          imagePrompt: "A professional woman wearing white blouse, black trousers, black flats, blazer, full body shot, business fashion photography, clean background, professional lighting"
        },
        {
          title: "Weekend Brunch",
          category: "Weekend",
          items: { top: "Cream Sweater", bottom: "Brown Skirt", shoes: "Brown Loafers", accessory: "Beige Scarf" },
          colors: ["cream", "brown"],
          season: "Fall, Winter",
          styleTip: "Chic and comfortable for casual outings",
          imagePrompt: "A stylish person wearing cream sweater, brown skirt, brown loafers, beige scarf, full body shot, casual fashion photography, clean background, professional lighting"
        },
        {
          title: "Evening Glam",
          category: "Evening",
          items: { top: "Black Dress", bottom: "N/A", shoes: "Black Heels", accessory: "Gold Necklace" },
          colors: ["black", "gold"],
          season: "All Seasons",
          styleTip: "Elegant and sophisticated for special occasions",
          imagePrompt: "An elegant woman wearing black evening dress, black heels, gold necklace, full body shot, luxury fashion photography, elegant background, professional lighting"
        }
      ];
      console.log("ℹ️  Using default outfits");
    }

    // Generate images for each outfit and save
    const generatedOutfits = [];

    for (const outfit of outfitsData.slice(0, count)) {
      // Use AI-generated image prompt if available, otherwise generate one
      const finalImagePrompt = outfit.imagePrompt || `A stylish ${outfit.category.toLowerCase()} outfit: ${outfit.items.top}, ${outfit.items.bottom}, ${outfit.items.shoes}, ${outfit.items.accessory}. Professional fashion photography, modern aesthetic.`;
      const imageUrl = await generateOutfitImage(finalImagePrompt);

      const savedOutfit = await OutfitModel.create({
        userId,
        name: outfit.title,
        description: outfit.styleTip,
        image: imageUrl,
        occasion: outfit.category,
        items: [],
      });

      generatedOutfits.push({
        _id: savedOutfit._id,
        title: outfit.title,
        category: outfit.category,
        items: outfit.items,
        colors: outfit.colors,
        season: outfit.season,
        styleTip: outfit.styleTip,
        image: imageUrl,
      });
    }

    res.json({ outfits: generatedOutfits });

  } catch (err) {
    console.error("❌ Outfit generation error:", err.message);
    res.status(500).json({ error: "Failed to generate outfits", details: err.message });
  }
});

/* =====================
   GENERATE OUTFIT SUGGESTIONS - WITH HUGGINGFACE VALIDATION
===================== */

router.post("/suggestions/huggingface", async (req, res) => {
  try {
    const userId = req.userId;
    const { occasion = "Casual", weather = "Hot", count = 4 } = req.body;

    console.log("📝 Generating outfit suggestions optimized for HuggingFace...");
    console.log(`   Occasion: ${occasion}, Weather: ${weather}, Count: ${count}`);

    // Get user's wardrobe for personalization
    const wardrobeItems = await WardrobeModel.find({ userId }).limit(20);

    let wardrobeSummary = "";
    if (wardrobeItems.length > 0) {
      wardrobeSummary = wardrobeItems
        .map(item => `${item.name} (${item.color})`)
        .slice(0, 5)
        .join(", ");
    }

    // Build optimized system prompt for HuggingFace image generation
    const systemPrompt = `You are a professional AI Fashion Stylist.

Generate ${count} outfit suggestions optimized for HuggingFace FLUX.1-dev image generation.

REQUIREMENTS:
1. Each outfit must have:
   - title (descriptive name)
   - category (Casual/Formal/Work/Weekend/Evening)
   - description (brief text)
   - items: {top, bottom, shoes, accessory}
   - colors: [array of main colors]
   - season (what season it works for)
   - styleTip (styling advice)
   - imagePrompt (for HuggingFace FLUX.1-dev)

2. Image Prompt Requirements (CRITICAL):
   - MUST start with "A stylish person" or "A professional" or "An elegant"
   - MUST include specific clothing items
   - MUST include "full body shot"
   - MUST include "realistic fashion photography"
   - MUST include "clean background"
   - MUST include "professional lighting"
   - 60-300 characters optimal length
   - NO special characters, NO line breaks, NO markdown
   - Example: "A stylish person wearing white linen shirt, khaki shorts, white sneakers, beige hat, full body shot, realistic fashion photography, clean background, professional lighting"

3. Style Requirements:
   - Occasion: ${occasion}
   - Weather: ${weather}
   - Consider Indian hot climate if weather is "Hot" (prefer cotton, linen, light colors)

${wardrobeSummary ? `User's wardrobe: ${wardrobeSummary}` : ""}

OUTPUT: Return ONLY valid JSON array, no markdown, no explanations.`;

    const userPrompt = `Generate ${count} different outfit suggestions with HuggingFace FLUX.1-dev optimized image prompts.

Return as JSON array like this:
[
  {
    "title": "string",
    "category": "Casual|Formal|Work|Weekend|Evening",
    "description": "string",
    "items": {"top": "string", "bottom": "string", "shoes": "string", "accessory": "string"},
    "colors": ["color1", "color2"],
    "season": "string",
    "styleTip": "string",
    "imagePrompt": "A stylish person wearing... [60-300 chars, no special chars]"
  }
]`;

    let outfitsData = [];

    // Try OpenRouter first (more reliable for outfit generation)
    try {
      if (!process.env.OPENROUTER_API_KEY) {
        throw new Error("OpenRouter API key not configured");
      }

      console.log("🎯 Calling OpenRouter for outfit generation...");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "https://fashion-blog-mern-1.onrender.com",
          "X-Title": "StyleVibe Fashion Assistant",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
          temperature: 0.8,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.statusText}`);
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content;

      if (!responseText) {
        throw new Error("No response from OpenRouter");
      }

      // Extract JSON from response
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("Failed to extract JSON from response");
      }

      outfitsData = JSON.parse(jsonMatch[0]);
      console.log(`✅ Generated ${outfitsData.length} outfits from OpenRouter`);

    } catch (err) {
      console.warn("⚠️  OpenRouter failed:", err.message);
      // Use fallback default outfits
      outfitsData = [];
    }

    // Validate and use fallback if needed
    if (!Array.isArray(outfitsData) || outfitsData.length === 0) {
      console.log("📋 Using default outfit suggestions with HuggingFace prompts");
      outfitsData = [
        {
          title: "Casual Comfort",
          category: "Casual",
          description: "White linen t-shirt with khaki shorts and white sneakers",
          items: {
            top: "White linen t-shirt",
            bottom: "Khaki shorts",
            shoes: "White sneakers",
            accessory: "Beige hat"
          },
          colors: ["white", "khaki", "beige"],
          season: "Summer",
          styleTip: "Perfect for hot weather with breathable fabrics",
          imagePrompt: "A stylish person wearing white linen t-shirt, khaki shorts, white sneakers, beige hat, full body shot, realistic fashion photography, clean background, professional lighting"
        },
        {
          title: "Work Ready",
          category: "Work",
          description: "Light blue shirt with black trousers and loafers",
          items: {
            top: "Light blue formal shirt",
            bottom: "Black trousers",
            shoes: "Black loafers",
            accessory: "Leather belt"
          },
          colors: ["light blue", "black", "brown"],
          season: "All Seasons",
          styleTip: "Professional look suitable for office environment",
          imagePrompt: "A professional wearing light blue shirt, black trousers, black loafers, full body shot, realistic business fashion photography, clean background, professional lighting"
        },
        {
          title: "Weekend Casual",
          category: "Weekend",
          description: "Cream cotton shirt with denim shorts and slip-ons",
          items: {
            top: "Cream cotton shirt",
            bottom: "Light denim shorts",
            shoes: "Brown slip-on shoes",
            accessory: "Sunglasses"
          },
          colors: ["cream", "light blue", "brown"],
          season: "Spring, Summer",
          styleTip: "Relaxed style perfect for weekend outings",
          imagePrompt: "A stylish person wearing cream cotton shirt, light denim shorts, brown slip-ons, sunglasses, full body shot, realistic fashion photography, clean background, professional lighting"
        },
        {
          title: "Evening Elegant",
          category: "Evening",
          description: "Dark navy shirt with grey trousers and dress shoes",
          items: {
            top: "Dark navy button-up shirt",
            bottom: "Grey formal trousers",
            shoes: "Brown dress shoes",
            accessory: "Watch"
          },
          colors: ["navy", "grey", "brown"],
          season: "All Seasons",
          styleTip: "Sophisticated look for evening gatherings",
          imagePrompt: "An elegant man wearing dark navy shirt, grey trousers, brown dress shoes, full body shot, realistic formal fashion photography, clean background, professional lighting"
        }
      ];
    }

    // Process outfits and validate imagePrompts
    const processedOutfits = [];

    for (const outfit of outfitsData.slice(0, count)) {
      // Validate and optimize the imagePrompt
      const imagePrompt = outfit.imagePrompt || `A stylish person wearing ${outfit.items.top}, ${outfit.items.bottom}, ${outfit.items.shoes}, full body shot, realistic fashion photography, clean background, professional lighting`;
      const validatedPrompt = validateAndOptimizePrompt(imagePrompt);

      // Generate image using HuggingFace
      console.log(`🎨 Generating image for "${outfit.title}"...`);
      const imageUrl = await generateOutfitImage(validatedPrompt);

      processedOutfits.push({
        title: outfit.title,
        category: outfit.category,
        description: outfit.description,
        items: outfit.items,
        colors: outfit.colors,
        season: outfit.season,
        styleTip: outfit.styleTip,
        imagePrompt: validatedPrompt, // Return the validated prompt for reference
        image: imageUrl,
      });
    }

    console.log(`✅ Successfully generated and validated ${processedOutfits.length} outfit suggestions`);

    res.json({
      success: true,
      count: processedOutfits.length,
      outfits: processedOutfits,
      metadata: {
        occasion,
        weather,
        generatedAt: new Date().toISOString(),
        huggingfaceModel: "Stable Diffusion 3 / FLUX.1 / Stable Diffusion 2 (with automatic fallback)"
      }
    });

  } catch (err) {
    console.error("❌ HuggingFace outfit suggestion error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to generate outfit suggestions",
      details: err.message
    });
  }
});

/* =====================
   VALIDATE HUGGINGFACE IMAGE PROMPT
===================== */

router.post("/validate/prompt", async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({
        success: false,
        error: "Prompt must be a non-empty string"
      });
    }

    const validatedPrompt = validateAndOptimizePrompt(prompt);

    res.json({
      success: true,
      originalPrompt: prompt,
      validatedPrompt: validatedPrompt,
      length: validatedPrompt.length,
      isValid: true,
      recommendations: {
        length: `${validatedPrompt.length} characters (optimal: 60-300)`,
        startsWithPerson: validatedPrompt.toLowerCase().includes("person") || validatedPrompt.toLowerCase().includes("professional") || validatedPrompt.toLowerCase().includes("elegant"),
        hasClothingItems: validatedPrompt.toLowerCase().includes("wearing"),
        hasFullBody: validatedPrompt.toLowerCase().includes("full body"),
        hasPhotography: validatedPrompt.toLowerCase().includes("photography"),
        hasBackground: validatedPrompt.toLowerCase().includes("clean background"),
        hasLighting: validatedPrompt.toLowerCase().includes("lighting")
      }
    });

  } catch (err) {
    console.error("❌ Prompt validation error:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to validate prompt",
      details: err.message
    });
  }
});

router.get("/user/:userId", async (req, res) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Only allow the logged-in user to access their own outfits.
    if (req.params.userId !== userId.toString()) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const outfits = await OutfitModel.find({ userId })
      .populate("items")
      .sort({ createdAt: -1 });

    res.json(outfits);
  } catch (err) {
    console.error("Failed to fetch outfits:", err);
    res.status(500).json({ error: "Failed to fetch outfits" });
  }
});

/* =====================
   OUTFIT - DELETE
===================== */

router.delete("/:id", async (req, res) => {
  try {
    const outfit = await OutfitModel.findByIdAndDelete(req.params.id);
    res.json({ message: "Outfit deleted", outfit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete outfit" });
  }
});

export default router;