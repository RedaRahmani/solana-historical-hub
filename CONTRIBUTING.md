# Solana Historical Hub - Contributing Guide

Thank you for your interest in contributing to Solana Historical Hub! This project aims to create sustainable infrastructure for Solana's historical data and pioneer the agent economy.

## 🎯 Project Vision

We're building:
1. A **sustainable revenue model** for archive node providers
2. An **agent-friendly** payment system (no credit cards needed)
3. A **reusable framework** for x402-powered APIs in the Solana ecosystem

## 🚀 Getting Started

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/solana-historical-hub.git
cd solana-historical-hub
npm install
```

### 2. Set Up Development Environment

```bash
cp .env.example .env
# Edit .env with your devnet wallet and configuration
```

### 3. Run Tests

```bash
npm test
npm run lint
```

### 4. Start Development Server

```bash
npm run dev
# Server runs on http://localhost:3000 with auto-reload
```

## 📋 Contribution Areas

### High Priority

1. **Redis Integration** (`src/stores/paymentStore.js`)
   - Replace in-memory Map with Redis
   - Add clustering support
   - Implement distributed locking

2. **Revenue Splitting** (new: `src/services/revenueSplitter.js`)
   - Multi-party payment settlements
   - Configurable split ratios
   - SPL Token transfer hooks

3. **Analytics Dashboard** (new: `src/routes/analytics.js`)
   - Query statistics
   - Revenue tracking
   - Provider performance metrics

4. **Mainnet Support** (configuration + docs)
   - Mainnet USDC integration
   - Production security hardening
   - Deployment guide

### Medium Priority

5. **Additional RPC Methods**
   - Implement more Solana RPC methods
   - Add method-specific pricing
   - Optimize data size handling

6. **WebSocket Support**
   - Real-time subscriptions with x402
   - Payment per subscription duration
   - Connection management

7. **Multi-Currency Support**
   - SOL, BONK, other SPL tokens
   - Dynamic exchange rates
   - Token preference system

### Nice to Have

8. **More Agent Examples**
   - AutoGPT integration
   - BabyAGI example
   - Custom tool templates

9. **Provider Registry**
   - Multiple Old Faithful nodes
   - Health checks and failover
   - Load balancing

10. **Documentation Improvements**
    - Video tutorials
    - More code examples
    - Troubleshooting guide

## 🔧 Development Guidelines

### Code Style

- **Linting**: ESLint with Airbnb base config
- **Formatting**: 2-space indentation, single quotes
- **Comments**: JSDoc for all functions
- **Naming**: camelCase for variables, PascalCase for classes

### Testing Requirements

All contributions must include tests:

```javascript
// Unit test example
describe('MyNewFeature', () => {
  it('should handle valid input', () => {
    // Test implementation
  });

  it('should handle errors gracefully', () => {
    // Error handling test
  });
});
```

**Coverage Requirements:**
- Functions: 80%
- Branches: 70%
- Lines: 80%

### Git Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add revenue splitting service
fix: Resolve payment verification race condition
docs: Update API reference for new methods
test: Add e2e tests for WebSocket subscriptions
refactor: Simplify payment store interface
```

### Pull Request Process

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Write tests**: Ensure all new code has tests
3. **Run test suite**: `npm test` (must pass)
4. **Run linter**: `npm run lint` (must pass)
5. **Update docs**: Add/update relevant documentation
6. **Commit changes**: Use conventional commit format
7. **Push branch**: `git push origin feature/your-feature`
8. **Open PR**: Use the PR template
9. **Address reviews**: Respond to feedback promptly

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] E2E tests added/updated
- [ ] Manual testing completed

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
```

## 🐛 Bug Reports

Use the GitHub issue template:

```markdown
**Describe the bug**
Clear description of the bug

**To Reproduce**
Steps to reproduce:
1. Send request '...'
2. With parameters '...'
3. See error

**Expected behavior**
What should happen

**Environment:**
- Node version: [e.g., 20.10.0]
- OS: [e.g., Ubuntu 22.04]
- Configuration: [relevant .env vars]

**Logs**
```
Paste relevant log output
```
```

## 💡 Feature Requests

Use the GitHub discussion board for feature ideas:

1. Search existing discussions
2. Create new discussion if needed
3. Explain use case and benefits
4. Discuss implementation approach

## 🏗️ Architecture Guidelines

### Adding New Services

```javascript
// src/services/myService.js
const logger = require('../utils/logger');

/**
 * Service description
 */
class MyService {
  constructor(config) {
    this.config = config;
  }

  async myMethod() {
    try {
      logger.info('Doing something...');
      // Implementation
    } catch (error) {
      logger.error('Error in myMethod:', error);
      throw error;
    }
  }
}

module.exports = MyService;
```

### Adding New Routes

```javascript
// src/routes/myRoute.js
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Implementation
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

### Error Handling

Always use structured error handling:

```javascript
try {
  // Risky operation
} catch (error) {
  logger.error('Context-specific message:', error);
  
  // Return user-friendly error
  return res.status(500).json({
    error: 'error_code',
    message: 'User-friendly message',
  });
}
```

## 📚 Documentation Standards

### Code Documentation

```javascript
/**
 * Function description
 * @param {string} param1 - Description of param1
 * @param {Object} param2 - Description of param2
 * @param {number} param2.field - Description of field
 * @returns {Promise<Object>} Description of return value
 * @throws {Error} When something goes wrong
 */
async function myFunction(param1, param2) {
  // Implementation
}
```

### README Updates

When adding features:
1. Update relevant sections in README.md
2. Add examples if applicable
3. Update architecture diagram if needed
4. Add to feature list

## 🔒 Security

### Reporting Security Issues

**DO NOT** open public issues for security vulnerabilities.

Instead:
1. Email: security@[your-domain].com
2. Provide detailed description
3. Include steps to reproduce
4. Allow 90 days for fix before disclosure

### Security Best Practices

- Never commit secrets or keys
- Use environment variables for configuration
- Validate all user input
- Sanitize error messages (no internal details)
- Use parameterized queries (if adding DB)
- Follow principle of least privilege

## 🤝 Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: [Add Discord invite if created]
- **Twitter**: [@YourHandle]

### Code of Conduct

We follow the [Contributor Covenant](https://www.contributor-covenant.org/):

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect differing opinions
- Prioritize community health

## 🏆 Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Featured on project website (if created)

Top contributors may receive:
- Maintainer status
- Early access to new features
- Conference talk opportunities

## 📝 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Solana Historical Hub! Together we're building the future of the agent economy. 🚀
