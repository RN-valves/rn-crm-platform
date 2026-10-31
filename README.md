# RN Valves CRM Platform

Enterprise WhatsApp CRM and AI Automation Platform for RN Valves & Faucets Private Limited.

## Architecture

- **Backend**: Node.js, Express, TypeScript, BullMQ, Mongoose, Socket.io
- **Frontend**: Next.js 14, React, Tailwind CSS, Lucide Icons
- **Chat Engine**: Chatwoot v3.13 + PostgreSQL pgvector + Redis
- **WhatsApp Gateway**: Evolution API v2.3.7 (Baileys instance `RNchat`)
- **Dual MongoDB**: Strict Read-Only to live e-commerce (`rn-valves`), isolated read/write for CRM (`rn-crm`)
- **Deployment**: Hostinger VPS (KVM 4, Ubuntu 24.04), Coolify, Traefik Reverse Proxy with Automated Let's Encrypt SSL
