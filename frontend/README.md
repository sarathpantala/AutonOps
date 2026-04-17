# AutonOps Frontend

A modern React/TypeScript frontend for the AutonOps AI SRE platform.

## Tech Stack

- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** for styling with dark mode support
- **Custom design system** with premium SaaS aesthetics

## Components

### LoginPage

A premium SaaS-style login page for Remedion with the following features:

#### Features
- **Email + Password Login**: Standard authentication form
- **Google OAuth**: "Continue with Google" button
- **Loading States**: Visual feedback during authentication
- **Error Handling**: User-friendly error messages
- **Forgot Password**: Link for password recovery
- **Responsive Design**: Works on desktop and mobile
- **Dark/Light Mode**: Automatic theme support

#### Layout
- **Left Side**: Product branding with gradient background
  - Product name: "Remedion"
  - Tagline: "Autonomous incident response for Kubernetes"
- **Right Side**: Centered login form card

#### Design
- Clean, premium SaaS aesthetics (inspired by Stripe/Vercel)
- Soft shadows and rounded corners
- Smooth animations and transitions
- Accessible form controls

#### Usage

```tsx
import LoginPage from './components/LoginPage';

function App() {
  const handleLogin = async (email: string, password: string) => {
    // Implement login logic
    console.log('Login:', email, password);
  };

  const handleGoogleLogin = async () => {
    // Implement Google OAuth
    console.log('Google login');
  };

  return (
    <LoginPage
      onLogin={handleLogin}
      onGoogleLogin={handleGoogleLogin}
    />
  );
}
```

#### Props

```tsx
interface LoginPageProps {
  onLogin?: (email: string, password: string) => Promise<void>;
  onGoogleLogin?: () => Promise<void>;
}
```

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Design System

The app uses a custom design system with:

- **Colors**: Custom brand colors with dark mode variants
- **Typography**: Inter font family
- **Shadows**: Soft, premium shadow system
- **Spacing**: Consistent spacing scale
- **Components**: Reusable UI components

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+