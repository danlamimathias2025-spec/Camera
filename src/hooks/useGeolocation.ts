import { useState, useEffect } from 'react';
import { LocationData } from '../types';

export function useGeolocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function fetchIpLocation(): Promise<LocationData | null> {
      try {
        const res = await fetch('https://ipapi.co/json/', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude) {
            return {
              lat: Number(data.latitude),
              lng: Number(data.longitude),
              city: data.city || 'Unknown City',
              country: data.country_name || data.country || 'Global',
              region: data.region || '',
              ip: data.ip || '',
              accuracy: 1000,
              updatedAt: new Date().toISOString()
            };
          }
        }
      } catch (err) {
        console.warn('Primary IP location lookup fallback:', err);
      }

      // Secondary IP Geolocation Fallback
      try {
        const res = await fetch('https://freeipapi.com/api/json', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude) {
            return {
              lat: Number(data.latitude),
              lng: Number(data.longitude),
              city: data.cityName || 'Local Hub',
              country: data.countryName || 'Global',
              region: data.regionName || '',
              ip: data.ipAddress || '',
              accuracy: 2000,
              updatedAt: new Date().toISOString()
            };
          }
        }
      } catch (e) {
        console.warn('Secondary IP location lookup error:', e);
      }

      return null;
    }

    // Try HTML5 Browser Geolocation first
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!isMounted) return;
          const userLocation: LocationData = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            city: 'GPS Coordinates',
            country: 'Browser Location',
            accuracy: pos.coords.accuracy,
            updatedAt: new Date().toISOString()
          };

          // Enrich with IP city/country if possible in background
          fetchIpLocation().then(ipLoc => {
            if (isMounted) {
              if (ipLoc) {
                setLocation({
                  ...userLocation,
                  city: ipLoc.city,
                  country: ipLoc.country,
                  region: ipLoc.region,
                  ip: ipLoc.ip
                });
              } else {
                setLocation(userLocation);
              }
              setLoading(false);
            }
          });
        },
        async () => {
          // Geolocation permission denied or failed, use IP location
          const ipLoc = await fetchIpLocation();
          if (isMounted) {
            if (ipLoc) {
              setLocation(ipLoc);
            } else {
              // Standard default fallback location (San Francisco Bay)
              setLocation({
                lat: 37.7749,
                lng: -122.4194,
                city: 'San Francisco',
                country: 'United States',
                accuracy: 5000,
                updatedAt: new Date().toISOString()
              });
            }
            setLoading(false);
          }
        },
        { timeout: 6000, maximumAge: 60000 }
      );
    } else {
      fetchIpLocation().then(ipLoc => {
        if (isMounted) {
          setLocation(ipLoc || {
            lat: 37.7749,
            lng: -122.4194,
            city: 'San Francisco',
            country: 'United States',
            accuracy: 5000,
            updatedAt: new Date().toISOString()
          });
          setLoading(false);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  return { location, loading };
}
