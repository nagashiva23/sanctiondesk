export const metadata = {
  title: 'SanctionDesk -- Demo Login',
  description: 'Hardcoded-credential demo login for presenting SanctionDesk\'s roles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0b0d12', color: '#e5e7eb', minHeight: '100vh' }}>
        {children}
      </body>
    </html>
  );
}
