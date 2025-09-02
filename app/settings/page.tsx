import SettingsPanel from '../../components/settings-panel';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="p-6 border-b">
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>
      <main className="p-6">
        <SettingsPanel />
      </main>
    </div>
  );
}