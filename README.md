# T.N.D. Tactical Narcotics Division - EVE Capsuleer Tools

A comprehensive EVE Online operations hub built with [Next.js 16](https://nextjs.org) for Tactical Narcotics Division corporation members. Access real-time market data, plan routes, analyze assets, and manage pilot intelligence—all in one terminal.

![TND Logo](public/media/logo.png)

## 🚀 Features

### Core Tools
- **System Lookup** - Intelligence gathering on specific systems
- **Route Planner** - Optimized path calculation for travel
- **Ship Fitting** - EVE fitting browser and optimizer
- **Player Lookup** - Character intelligence and history
- **Corporation Lookup** - Corp statistics and member analysis
- **Local Check** - Real-time local system monitoring
- **Asset Analysis** - Comprehensive portfolio evaluation
- **Market Analysis** - Price trends and market data
- **Market Browser** - Item browsing and comparison
- **Price Check** - Bulk ISK valuation
- **Price Comparison** - Multi-hub pricing
- **Safe to Warp** - Security status analysis

### Authentication
- **EVE Online SSO** - Official EVE Portal OAuth integration
- **Mock Mode** - Development without EVE credentials (perfect for testing!)

## 📦 Tech Stack

- **Framework**: Next.js 16.0.4 (with Turbopack)
- **Language**: TypeScript 5.9
- **UI Framework**: React 19.2 + TailwindCSS 4.1
- **Authentication**: NextAuth.js 5.0
- **Components**: Radix UI with custom styling
- **Data**: EVE Online ESI API + Custom SDKs

## 🎯 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/xsi-sh/tnd.corpsite.git
cd tnd.corpsite

# Install dependencies
npm install
```

### Development with Mock Mode (⭐ Recommended for Testing)

Mock mode allows you to run the entire site without EVE Online authentication:

```bash
# .env.local is already created with mock settings
npm run dev
```

The site will auto-login with test data. Access at `http://localhost:3000`

**Mock mode includes:**
- Simulated EVE character data
- Realistic wallet and asset information
- Mock market prices
- Skill point data
- All features functional with test data

### Development with Real EVE Credentials

```bash
# Edit .env.local
NEXT_PUBLIC_MOCK_MODE=false
EVE_CLIENT_ID=your_client_id
EVE_CLIENT_SECRET=your_client_secret
AUTH_SECRET=your_secret

# Get credentials from https://developers.eveonline.com/applications
npm run dev
```

## 📸 Screenshots

### Dashboard - Main Terminal
![Dashboard](public/media/Screenshot%202026-03-04%20005610.png)

The main dashboard displays character information, wallet balance, active ship, skill points, and important financials at a glance.

### Market Analysis
![Market Analysis](public/media/Screenshot%202026-03-04%20005622.png)

Comprehensive market analysis tools with price trends, volume data, and trading opportunities across multiple regional hubs.

### Asset Analysis
![Asset Analysis](public/media/Screenshot%202026-03-04%20005652.png)

Full portfolio tracking with asset valuation, location tracking, and wealth breakdown across all character locations.

### System Lookup
![System Lookup](public/media/Screenshot%202026-03-04%20005704.png)

In-depth system intelligence including security status, NPC stations, jump gates, and strategic location information.

### Navigation & Tools
![Navigation](public/media/Screenshot%202026-03-04%20005727.png)

Intuitive navigation menu with quick access to all major tools and features for tactical operations.

## 📁 Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── (app)/               # Protected application routes
│   │   ├── assets/          # Asset analysis page
│   │   ├── market/          # Market analysis page
│   │   ├── player-lookup/   # Player intel page
│   │   ├── system-lookup/   # System intel page
│   │   └── ...              # Other tools
│   ├── api/                 # API endpoints
│   │   ├── assets/route.ts
│   │   ├── market/route.ts
│   │   └── ...
│   ├── login/               # Authentication page
│   └── layout.tsx           # Root layout
├── components/              # React components
│   ├── Dashboard.tsx        # Main dashboard component
│   ├── LoginButton.tsx      # Auth button component
│   ├── evefit/              # EVE fitting components
│   ├── magic/               # Animated UI components
│   └── ui/                  # Reusable UI library
├── lib/                     # Utilities & SDKs
│   ├── esi-sdk/            # EVE Online ESI SDK
│   │   ├── client.ts       # API client
│   │   ├── types.ts        # Type definitions
│   │   └── index.ts
│   ├── mockData.ts         # Mock data for testing
│   ├── types/              # Domain-specific types
│   │   ├── esi.ts
│   │   ├── market.ts
│   │   ├── player-intel.ts
│   │   ├── corp-intel.ts
│   │   └── ...
│   └── utils/              # Helper functions
├── auth.ts                 # NextAuth configuration
└── proxy.ts                # API proxy
data/                       # Static game data
├── items.json
├── systems.json
├── stargates.json
├── corporations.json
└── alliances.json
esi-docs/                   # EVE ESI documentation
```

## 🔧 Environment Variables

Create a `.env.local` file in the root directory:

```env
# EVE Online OAuth (get from https://developers.eveonline.com/applications)
EVE_CLIENT_ID=your_app_id
EVE_CLIENT_SECRET=your_app_secret
AUTH_SECRET=your_auth_secret_32_chars_min

# Mock Mode (for development without EVE credentials)
NEXT_PUBLIC_MOCK_MODE=true

# Optional
NEXT_PUBLIC_ESI_USER_AGENT=TacticalNarcoticsDivision/1.0.0
```

## 🚀 Build & Deploy

```bash
# Build for production
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## 🎨 Features in Detail

### Intelligence Gathering
- Player and corp history lookups
- Security status analysis
- Standing evaluation
- Kill/loss history tracking
- Member database searches

### Market Tools
- Real-time price aggregation across hubs
- Market order management
- Profit margin analysis
- Bulk ISK valuation
- Price comparison across regions

### Navigation
- Jump gate pathfinding
- Avoidance route planning
- Security corridor mapping
- System intel integration
- Travel time calculation

### Asset Management
- Full portfolio tracking
- Location summary and grouping
- Value estimation and ROI
- Container asset trees
- Wealth breakdown by location

### Fitting Tools
- EVE Online fitting browser
- Ship configuration import/export
- Damage calculations
- Skill requirement analysis

## 🔐 Security

- Server-side token management
- No credentials stored client-side
- OAuth 2.0 with EVE Portal
- Secure session handling
- CSRF protection enabled
- Environment variable encryption

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues on GitHub.

### Development Workflow
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For issues, questions, or suggestions, please open an issue on the [GitHub repository](https://github.com/xsi-sh/tnd.corpsite).

## 🔗 Useful Links

- [EVE Online Official Site](https://www.eveonline.com)
- [EVE Online ESI Documentation](https://esi.eveonline.com)
- [NextAuth.js Documentation](https://next-auth.js.org)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Built with ❤️ for EVE Online pilots**

*Tactical Narcotics Division - Your trusted source for capsuleer operations*
