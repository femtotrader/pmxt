import { config } from 'dotenv'; config({ path: '../../.env' });
import pmxt from 'pmxtjs';

const client = new pmxt.Polymarket({
    privateKey: process.env.POLYMARKET_PRIVATE_KEY // Must start with '0x'
});