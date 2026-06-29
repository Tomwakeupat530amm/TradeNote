'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { Globe } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function LanguageSwitcher() {
  const t = useTranslations('LanguageSwitcher');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const switchLocale = (newLocale: string) => {
    // next-intl middleware will automatically set the NEXT_LOCALE cookie
    router.replace(pathname, { locale: newLocale });
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-800 transition-colors text-sm text-gray-300 hover:text-white"
        aria-label={t('label')}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{locale === 'en' ? 'EN' : 'VI'}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-32 bg-gray-900 border border-gray-800 rounded-md shadow-lg overflow-hidden z-50">
          <button
            onClick={() => switchLocale('en')}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 transition-colors ${
              locale === 'en' ? 'text-blue-400 font-medium' : 'text-gray-300'
            }`}
          >
            {t('en')}
          </button>
          <button
            onClick={() => switchLocale('vi')}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-800 transition-colors ${
              locale === 'vi' ? 'text-blue-400 font-medium' : 'text-gray-300'
            }`}
          >
            {t('vi')}
          </button>
        </div>
      )}
    </div>
  );
}
