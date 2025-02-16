const express = require('express');
const puppeteer = require('puppeteer-extra'); 
const path = require('path');
const cors = require('cors');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json()); // Allow JSON requests

const stores = [
    {
        name: 'ASDA',
        url: (searchTerm) => `https://groceries.asda.com/search/${searchTerm}`,
        selectors: {
            item: '.co-item',
            name: 'a',
            link: 'a',
            brand: '.co-product__brand',
            price: 'strong.co-product__price'
        }
    },
    {
        name: "Morrisons",
        url: (searchTerm) => `https://groceries.morrisons.com/search?q=${encodeURIComponent(searchTerm)}&sort=relevance`,
        selectors: {
            item: "div[data-test='fop-body']", 
            name: "h3[data-test='fop-title']",  
            link: "a[data-test='fop-product-link']",  
            price: "span[data-test='fop-price']"
        }
    }
];

const scrapeFirstProductFromStore = async (store, searchTerm) => {
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
      

    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36");

    const url = store.url(searchTerm);
    console.log(`Navigating to: ${url}`);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector(store.selectors.item, { visible: true, timeout: 30000 });

        const items = await page.$$(store.selectors.item);
        
        for (let item of items) {
            const nameElement = await item.$(store.selectors.name);
            const name = nameElement ? await page.evaluate(el => el.textContent.trim(), nameElement) : null;

            if (name && name.toLowerCase().includes(searchTerm.toLowerCase())) {
                const priceElement = await item.$(store.selectors.price);
                const priceText = priceElement ? await page.evaluate(el => el.textContent.trim(), priceElement) : null;
                
                const price = priceText ? priceText.replace(/[^\d.]/g, '') : "N/A";

                console.log(`Scraped: ${name} - Price: £${price}`);
                return { name, price, store: store.name };
            }
        }

        return { name: searchTerm, price: "Not Found", store: store.name };
    } catch (error) {
        console.error(`Error scraping ${store.name}:`, error);
        return { name: searchTerm, price: "Error", store: store.name };
    } finally {
        await browser.close();
    }
};

const scrapeAllStores = async (searchTerms) => {
    let allProducts = [];

    for (let searchTerm of searchTerms) {
        for (let store of stores) {
            const product = await scrapeFirstProductFromStore(store, searchTerm);
            allProducts.push(product);
        }
    }

    return allProducts;
};

app.post('/api/scrape', async (req, res) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid items array" });
    }

    console.log("Scraping products for:", items);
    const scrapedProducts = await scrapeAllStores(items.map(item => item.name));

    res.json(scrapedProducts);
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
