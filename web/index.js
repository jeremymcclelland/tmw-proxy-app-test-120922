// @ts-check
import { join } from "path";
import { readFileSync } from "fs";

import * as dotenv from 'dotenv';
dotenv.config();

import express from "express";
import serveStatic from "serve-static";
import fetch from 'node-fetch';


import shopify from "./shopify.js";
import productCreator from "./product-creator.js";
import GDPRWebhookHandlers from "./gdpr.js";


const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT, 10);

const STATIC_PATH =
  process.env.NODE_ENV === "production"
    ? `${process.cwd()}/frontend/dist`
    : `${process.cwd()}/frontend/`;

const app = express();

// Set up Shopify authentication and webhook handling
app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot()
);
app.post(
  shopify.config.webhooks.path,
  shopify.processWebhooks({ webhookHandlers: GDPRWebhookHandlers })
);


// Dummy Example /////////////

app.get('/api/tester', (req, res) => {
    res.send('Hey! It worked');
});


// Youtube Example /////////////


app.get('/api/youtube', async (req, res) => {

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?key=${process.env.YOUTUBEAPI}&channelId=${process.env.YOUTUBECHANNEL}&part=snippet,id&order=date&maxResults=20`);
    const data = await response.json();

    
    res.send(data);
});

// Klaviyo Example /////////////
app.get('/api/newsletter/:email', async (req, res) => {

    const url = `https://a.klaviyo.com/api/v2/list/${process.env.KLAVIYOLIST}/subscribe?api_key=${process.env.KLAVIYOAPI}`;
    const options = {
      method: 'POST',
      headers: {accept: 'application/json', 'content-type': 'application/json'},
      body: JSON.stringify({
        profiles: [
          {email: req.params.email}
        ]
      })
    };
    
    const response = await fetch(url, options)
      .then(res => res.json())
      .then(json => console.log(json))
      .catch(err => console.error('error:' + err));

    res.send(response);
});


// All endpoints after this point will require an active session
app.use("/api/*", shopify.validateAuthenticatedSession());

app.use(express.json());

app.get("/api/products/count", async (_req, res) => {
  const countData = await shopify.api.rest.Product.count({
    session: res.locals.shopify.session,
  });
  res.status(200).send(countData);
});

app.get("/api/products/create", async (_req, res) => {
  let status = 200;
  let error = null;

  try {
    await productCreator(res.locals.shopify.session);
  } catch (e) {
    console.log(`Failed to process products/create: ${e.message}`);
    status = 500;
    error = e.message;
  }
  res.status(status).send({ success: status === 200, error });
});

app.use(serveStatic(STATIC_PATH, { index: false }));

app.use("/*", shopify.ensureInstalledOnShop(), async (_req, res, _next) => {
  return res
    .status(200)
    .set("Content-Type", "text/html")
    .send(readFileSync(join(STATIC_PATH, "index.html")));
});

app.listen(PORT);
