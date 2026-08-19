import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../styles/watch-theme.css';
import {
  eventService,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
} from '../services/event.service.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { toDateTimeLocal, extractYouTubeId, resolveMediaUrl } from '../utils/format.js';
import { normalizeStudioForm } from '../utils/studioFields.js';
import { themeService } from '../services/theme.service.js';
import ThemeGallery from '../components/theme/ThemeGallery.jsx';
import EventQrCard from '../components/EventQrCard.jsx';
import YoutubeThumbnailPreview from '../components/admin/YoutubeThumbnailPreview.jsx';
import ToastBanner from '../components/ToastBanner.jsx';
import { useToast } from '../hooks/useToast.js';
import { streamService } from '../services/stream.service.js';
import { youtubeService } from '../services/youtube.service.js';
import { generateYoutubeThumbnail } from '../utils/generateYoutubeThumbnail.js';
import BackupStreamSettings, {
  validateBackupStreamFields,
} from '../components/live/BackupStreamSettings.jsx';

const LINK_COSTS = { youtube: 1, server: 5, server_youtube: 5, youtube_server: 5 };

const DEFAULT_FACEBOOK_RTMP = 'rtmps://live-api-s.facebook.com:443/rtmp';

/** Map checkbox destinations → existing streamingDestination (website playback). */
function streamTypeFromDestinations(destServer, destYoutube, websitePlayer) {
  if (destServer && destYoutube) {
    return websitePlayer === 'youtube' ? 'youtube_server' : 'server_youtube';
  }
  if (destYoutube && !destServer) return 'youtube';
  if (destServer) return 'server';
  return '';
}

const EMPTY = {
  title: '',
  description: '',
  category: 'other',
  status: 'draft',
  startTime: '',
  endTime: '',
  isOnline: true,
  location: 'Online',
  venue: '',
  youtubeUrl: '',
  hlsUrl: '',
  youtubeRtmpUrl: 'rtmp://a.rtmp.youtube.com/live2',
  youtubeStreamKey: '',
  youtubeStreamKeySet: false,
  youtubeForwardEnabled: true,
  facebookRtmpUrl: DEFAULT_FACEBOOK_RTMP,
  facebookStreamKey: '',
  facebookStreamKeySet: false,
  facebookForwardEnabled: false,
  adaptiveStreaming: false,
  chatEnabled: true,
  capacity: 0,
  tags: '',
  brideName: '',
  groomName: '',
  studioName: '',
  photographerName: '',
  photographerLogo: '',
  studioPhone: '',
  studioWhatsapp: '',
  studioEmail: '',
  studioWebsite: '',
  studioInstagram: '',
  studioFacebook: '',
  studioYoutube: '',
  studioMapsUrl: '',
  coverImage: '',
  shareThumbnail: '',
  pageTemplate: 'default',
  heroBackgroundImage: '',
  bridePhoto: '',
  groomPhoto: '',
  theme: '',
  shortCode: '',
  slug: '',
  qrCodeImage: '',
  qrCodeTargetUrl: '',
  brandDomain: '',
  backupStreamEnabled: false,
  backupYoutubeVideoId: '',
};

export default function EventForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAdmin, isSuperAdmin, isSubAdmin, refreshUser } = useAuth();
  const { settings } = useSettings();
  const logoInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const heroInputRef = useRef(null);
  const bridePhotoInputRef = useRef(null);
  const groomPhotoInputRef = useRef(null);
  const pendingCoverRef = useRef(null);
  const pendingThumbRef = useRef(null);
  const coverSourceRef = useRef(null);
  const thumbPreviewRef = useRef('');
  const skipThumbNameEffectRef = useRef(true);
  const pendingLogoRef = useRef(null);
  const pendingHeroRef = useRef(null);
  const pendingBridePhotoRef = useRef(null);
  const pendingGroomPhotoRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const { toast, showToast, clearToast } = useToast();

  // Streaming destinations (checkboxes). Website playback still uses the four
  // streamingDestination values; Facebook is an additive MediaMTX forward.
  const [destServer, setDestServer] = useState(
    searchParams.get('type') !== 'youtube'
  );
  const [destYoutube, setDestYoutube] = useState(
    searchParams.get('type') === 'youtube' ||
      searchParams.get('type') === 'server_youtube' ||
      searchParams.get('type') === 'youtube_server'
  );
  const [destFacebook, setDestFacebook] = useState(false);
  // When Server + YouTube: 'hls' → server_youtube, 'youtube' → youtube_server.
  const [websitePlayer, setWebsitePlayer] = useState(
    searchParams.get('type') === 'youtube_server' ? 'youtube' : 'hls'
  );

  const streamType =
    streamTypeFromDestinations(
      destServer || destFacebook,
      destYoutube,
      websitePlayer
    ) || 'server';
  const balance = user?.creditBalance ?? 0;
  const cost = LINK_COSTS[streamType] || 1;
  const isStaffEditor = isAdmin || isSubAdmin;
  const isServerDest = streamType !== 'youtube';
  const showCreditCosts = !isAdmin && !isEdit && isServerDest;
  const insufficient = showCreditCosts && balance < cost;

  const [serverStream, setServerStream] = useState(null);
  const [serverStreamLoading, setServerStreamLoading] = useState(false);
  const [youtubeConnected, setYoutubeConnected] = useState(false);
  const [youtubeIngest, setYoutubeIngest] = useState(null);

  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [thumbPreview, setThumbPreview] = useState('');
  const [thumbDirty, setThumbDirty] = useState(false);
  const [thumbError, setThumbError] = useState('');
  const [uploadingTemplateImg, setUploadingTemplateImg] = useState(false);
  const [error, setError] = useState('');
  const [allThemes, setAllThemes] = useState([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [eventOwnerIds, setEventOwnerIds] = useState({ organizer: '', createdBy: '' });

  const failoverFeatureEnabled = Boolean(settings?.failoverFeatureEnabled);
  const isEventOwner =
    !isEdit ||
    Boolean(
      user &&
        (String(eventOwnerIds.organizer) === String(user.id) ||
          String(eventOwnerIds.createdBy) === String(user.id))
    );
  const canEditBackup = failoverFeatureEnabled && (isSuperAdmin || isEventOwner);
  const effectiveServer = destServer || destFacebook;
  const showBackupSection =
    canEditBackup && form.isOnline && effectiveServer && streamType !== 'youtube';
  const usesServerIngest = effectiveServer && streamType !== 'youtube';
  const showYoutubeRtmpFields = destYoutube;
  const showYoutubeEmbedUrl =
    streamType === 'youtube' || streamType === 'youtube_server';
  const needsYoutubeForward =
    streamType === 'server_youtube' || streamType === 'youtube_server';
  const showFacebookFields = destFacebook;

  useEffect(() => {
    if (!isEdit) return;
    let active = true;
    eventService
      .get(id)
      .then((event) => {
        if (!active) return;
        setForm({
          title: event.title || '',
          description: event.description || '',
          category: event.category || 'other',
          status: event.status || 'draft',
          startTime: toDateTimeLocal(event.startTime),
          endTime: toDateTimeLocal(event.endTime),
          isOnline: event.isOnline ?? true,
          location: event.location || 'Online',
          venue: event.venue || '',
          youtubeUrl: (() => {
            const id = extractYouTubeId(event.youtubeVideoId);
            const watch = event.youtubeWatchUrl || '';
            const stream = event.streamUrl || '';
            if (id && extractYouTubeId(watch) === id) return watch;
            if (id && extractYouTubeId(stream) === id) return stream;
            if (id) return `https://youtu.be/${id}`;
            return watch || stream || '';
          })(),
          hlsUrl: event.hlsUrl || '',
          rtmpPublishUrl: event.rtmpPublishUrl || '',
          chatEnabled: event.chatEnabled ?? true,
          capacity: event.capacity || 0,
          tags: (event.tags || []).join(', '),
          brideName: event.brideName || '',
          groomName: event.groomName || '',
          studioName: event.studioName || '',
          photographerName: event.photographerName || '',
          photographerLogo: event.photographerLogo || '',
          studioPhone: event.studioPhone || '',
          studioWhatsapp: event.studioWhatsapp || '',
          studioEmail: event.studioEmail || '',
          studioWebsite: event.studioWebsite || '',
          studioInstagram: event.studioInstagram || '',
          studioFacebook: event.studioFacebook || '',
          studioYoutube: event.studioYoutube || '',
          studioMapsUrl: event.studioMapsUrl || '',
          coverImage: event.coverImage || '',
          shareThumbnail: event.shareThumbnail || '',
          pageTemplate: event.pageTemplate === 'classic-wedding' ? 'classic-wedding' : 'default',
          heroBackgroundImage: event.heroBackgroundImage || '',
          bridePhoto: event.bridePhoto || '',
          groomPhoto: event.groomPhoto || '',
          theme: event.theme?.id || event.theme || '',
          shortCode: event.shortCode || '',
          slug: event.slug || '',
          qrCodeImage: event.qrCodeImage || '',
          qrCodeTargetUrl: event.qrCodeTargetUrl || '',
          brandDomain: event.brandDomain || '',
          backupStreamEnabled: Boolean(event.backupStreamEnabled),
          backupYoutubeVideoId: event.backupYoutubeVideoId || '',
          youtubeRtmpUrl: event.youtubeRtmpUrl || 'rtmp://a.rtmp.youtube.com/live2',
          youtubeStreamKey: '',
          youtubeStreamKeySet: Boolean(event.youtubeStreamKeySet),
          youtubeForwardEnabled:
            event.youtubeForwardEnabled !== undefined
              ? Boolean(event.youtubeForwardEnabled)
              : event.streamingDestination === 'server_youtube' ||
                event.streamingDestination === 'youtube_server',
          facebookRtmpUrl: event.facebookRtmpUrl || DEFAULT_FACEBOOK_RTMP,
          facebookStreamKey: '',
          facebookStreamKeySet: Boolean(event.facebookStreamKeySet),
          facebookForwardEnabled: Boolean(event.facebookForwardEnabled),
          adaptiveStreaming: Boolean(event.adaptiveStreaming),
        });
        if (event.shareThumbnail) setThumbPreview(event.shareThumbnail);
        setEventOwnerIds({
          organizer: event.organizer?.id || event.organizer?._id || event.organizer || '',
          createdBy: event.createdBy?.id || event.createdBy?._id || event.createdBy || '',
        });
        const dest = event.streamingDestination || '';
        let resolved = dest;
        if (
          dest !== 'server' &&
          dest !== 'youtube' &&
          dest !== 'server_youtube' &&
          dest !== 'youtube_server'
        ) {
          const provider = event.streamProvider || '';
          const credit = event.creditType || '';
          if (provider === 'rtmp' || provider === 'hls' || credit === 'server') {
            resolved = event.youtubeForwardEnabled ? 'server_youtube' : 'server';
          } else {
            resolved = 'youtube';
          }
        }
        setDestServer(
          resolved === 'server' ||
            resolved === 'server_youtube' ||
            resolved === 'youtube_server'
        );
        setDestYoutube(
          resolved === 'youtube' ||
            resolved === 'server_youtube' ||
            resolved === 'youtube_server'
        );
        setDestFacebook(Boolean(event.facebookForwardEnabled));
        setWebsitePlayer(resolved === 'youtube_server' ? 'youtube' : 'hls');
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, isEdit]);

  useEffect(() => {
    const usesServer =
      streamType === 'server' || streamType === 'server_youtube' || streamType === 'youtube_server';
    if (!isEdit || !id || !usesServer || !form.isOnline) {
      setServerStream(null);
      return undefined;
    }
    let active = true;
    setServerStreamLoading(true);
    Promise.all([
      streamService.getKey(id).catch(() => null),
      streamService.getConfig(id).catch(() => null),
    ])
      .then(([keyInfo, cfg]) => {
        if (!active || !keyInfo) return;
        setServerStream({
          rtmpUrl: keyInfo.ingestUrl || '',
          streamKey: keyInfo.streamKey || '',
          hlsPlayerUrl: keyInfo.playbackUrl || cfg?.playbackUrl || cfg?.hlsUrl || '',
        });
      })
      .finally(() => active && setServerStreamLoading(false));
    return () => {
      active = false;
    };
  }, [isEdit, id, streamType, form.isOnline]);

  useEffect(() => {
    let active = true;
    youtubeService
      .status()
      .then((data) => active && setYoutubeConnected(Boolean(data?.connected)))
      .catch(() => active && setYoutubeConnected(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEdit || !id || !destYoutube) {
      if (!isEdit) setYoutubeIngest(null);
      return undefined;
    }
    let active = true;
    eventService
      .getYoutubeIngest(id)
      .then((data) => {
        if (!active) return;
        setYoutubeIngest(data);
        if (data?.watchUrl || data?.broadcastId) {
          setForm((f) => ({
            ...f,
            youtubeRtmpUrl: data.rtmpUrl || f.youtubeRtmpUrl,
            youtubeStreamKeySet: Boolean(data.streamKey) || f.youtubeStreamKeySet,
          }));
        }
      })
      .catch(() => active && setYoutubeIngest(null));
    return () => {
      active = false;
    };
  }, [isEdit, id, destYoutube]);

  useEffect(() => {
    let active = true;
    setThemesLoading(true);
    themeService
      .list()
      .then((list) => {
        const sorted = (list || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        active && setAllThemes(sorted);
      })
      .catch(() => active && setAllThemes([]))
      .finally(() => active && setThemesLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const revokeThumbPreview = () => {
    if (thumbPreviewRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(thumbPreviewRef.current);
    }
    thumbPreviewRef.current = '';
  };

  const coverSourceForThumb = (coverImage) => {
    if (coverSourceRef.current instanceof Blob) return coverSourceRef.current;
    if (pendingCoverRef.current instanceof Blob) return pendingCoverRef.current;
    if (!coverImage) return null;
    if (coverImage.startsWith('blob:') || coverImage.startsWith('data:')) return coverImage;
    return resolveMediaUrl(coverImage);
  };

  const generateThumbFromForm = useCallback(
    async (nextForm) => {
      const source = coverSourceForThumb(nextForm.coverImage);
      if (!source) {
        setThumbError('Upload a couple photo first.');
        return null;
      }
      setGeneratingThumb(true);
      setThumbError('');
      try {
        const { file, dataUrl } = await generateYoutubeThumbnail({
          source,
          event: nextForm,
          settings,
        });
        revokeThumbPreview();
        pendingThumbRef.current = file;
        thumbPreviewRef.current = dataUrl;
        setThumbPreview(dataUrl);
        setThumbDirty(true);
        return file;
      } catch (err) {
        setThumbError(err.message || 'Could not generate thumbnail.');
        return null;
      } finally {
        setGeneratingThumb(false);
      }
    },
    [settings]
  );

  const generateThumbFromFormRef = useRef(generateThumbFromForm);
  generateThumbFromFormRef.current = generateThumbFromForm;

  useEffect(() => {
    if (loading) return undefined;
    if (skipThumbNameEffectRef.current) {
      skipThumbNameEffectRef.current = false;
      return undefined;
    }
    if (!form.coverImage && !coverSourceRef.current && !pendingCoverRef.current) return undefined;
    const snapshot = form;
    const timer = setTimeout(() => {
      generateThumbFromFormRef.current(snapshot);
    }, 450);
    return () => clearTimeout(timer);
  }, [loading, form.brideName, form.groomName, form.title, form.shortCode, form.slug]);

  useEffect(() => {
    return () => revokeThumbPreview();
  }, []);

  const persistThumbFile = async (eventId, file) => {
    if (!eventId || !file) return null;
    setUploadingThumb(true);
    setThumbError('');
    try {
      const { shareThumbnail } = await eventService.uploadShareThumbnail(eventId, file);
      pendingThumbRef.current = null;
      setForm((f) => ({ ...f, shareThumbnail }));
      setThumbDirty(false);
      return shareThumbnail;
    } catch (err) {
      setThumbError(err.message || 'Could not save thumbnail.');
      return null;
    } finally {
      setUploadingThumb(false);
    }
  };

  const handleRegenerateThumbnail = async () => {
    const file = await generateThumbFromForm(form);
    if (file && isEdit) await persistThumbFile(id, file);
  };

  const handleSaveThumbnail = async () => {
    let file = pendingThumbRef.current;
    if (!file) file = await generateThumbFromForm(form);
    if (!file) return;
    if (!isEdit) {
      showToast('Thumbnail will upload when you create the event.');
      return;
    }
    await persistThumbFile(id, file);
  };

  const handleDownloadThumbnail = () => {
    const src = thumbPreview || form.shareThumbnail;
    if (!src) return;
    const a = document.createElement('a');
    a.href = src.startsWith('data:') || src.startsWith('blob:') ? src : resolveMediaUrl(src);
    a.download = 'youtube-thumbnail.jpg';
    a.rel = 'noopener';
    a.click();
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isEdit) {
      pendingLogoRef.current = file;
      setForm((f) => ({ ...f, photographerLogo: URL.createObjectURL(file) }));
      return;
    }
    setUploadingLogo(true);
    setError('');
    try {
      const { photographerLogo } = await eventService.uploadLogo(id, file);
      setForm((f) => ({ ...f, photographerLogo }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    coverSourceRef.current = file;
    if (!isEdit) {
      pendingCoverRef.current = file;
      setForm((f) => {
        const next = { ...f, coverImage: URL.createObjectURL(file) };
        generateThumbFromForm(next);
        return next;
      });
      return;
    }
    setUploadingCover(true);
    setError('');
    try {
      const { coverImage } = await eventService.uploadCover(id, file);
      const nextForm = { ...form, coverImage };
      setForm((f) => ({ ...f, coverImage }));
      const thumbFile = await generateThumbFromForm({ ...nextForm, coverImage });
      if (thumbFile) await persistThumbFile(id, thumbFile);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  const handleTemplateImageUpload = async (kind, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const field =
      kind === 'hero' ? 'heroBackgroundImage' : kind === 'bride' ? 'bridePhoto' : 'groomPhoto';
    const pendingRef =
      kind === 'hero'
        ? pendingHeroRef
        : kind === 'bride'
          ? pendingBridePhotoRef
          : pendingGroomPhotoRef;
    const inputRef =
      kind === 'hero'
        ? heroInputRef
        : kind === 'bride'
          ? bridePhotoInputRef
          : groomPhotoInputRef;

    if (!isEdit) {
      pendingRef.current = file;
      setForm((f) => ({ ...f, [field]: URL.createObjectURL(file) }));
      return;
    }
    setUploadingTemplateImg(true);
    setError('');
    try {
      const data = await eventService.uploadTemplateImage(id, kind, file);
      setForm((f) => ({ ...f, ...data }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingTemplateImg(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleQrUpdated = useCallback((data) => {
    setForm((f) => ({
      ...f,
      qrCodeImage: data.qrCodeImage,
      qrCodeTargetUrl: data.qrCodeTargetUrl,
    }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saveInFlightRef.current || submitting || uploadingLogo || uploadingCover || uploadingThumb || uploadingTemplateImg) return;

    setError('');
    const studioForm = normalizeStudioForm(form);
    saveInFlightRef.current = true;
    setSubmitting(true);

    if (form.isOnline && !destServer && !destYoutube && !destFacebook) {
      setError('Please select at least one streaming destination.');
      saveInFlightRef.current = false;
      setSubmitting(false);
      return;
    }

    let ytConnected = Boolean(youtubeConnected);
    try {
      const ytStatus = await youtubeService.status();
      ytConnected = Boolean(ytStatus?.connected ?? ytStatus?.data?.connected);
      setYoutubeConnected(ytConnected);
    } catch {
      /* keep last known ytConnected */
    }

    const rawYoutubeUrl = (form.youtubeUrl || '').trim();
    const youtubeVideoId = extractYouTubeId(rawYoutubeUrl);

    const canAutoCreateYoutube =
      ytConnected &&
      (streamType === 'youtube' || streamType === 'youtube_server' || destYoutube);
    if (
      form.isOnline &&
      (streamType === 'youtube' || streamType === 'youtube_server') &&
      !youtubeVideoId &&
      !rawYoutubeUrl &&
      !canAutoCreateYoutube
    ) {
      setError(
        streamType === 'youtube_server'
          ? 'A valid YouTube Live / embed URL is required for YouTube + Server.'
          : 'A valid YouTube Live URL is required for YouTube Live events.'
      );
      saveInFlightRef.current = false;
      setSubmitting(false);
      return;
    }

    if (form.isOnline && needsYoutubeForward && !canAutoCreateYoutube) {
      if (!form.youtubeRtmpUrl?.trim()) {
        setError('YouTube Server URL is required for this destination.');
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
      if (!form.youtubeStreamKey?.trim() && !form.youtubeStreamKeySet) {
        setError('YouTube Stream Key is required for this destination.');
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
    }

    if (form.isOnline && destFacebook) {
      if (!form.facebookRtmpUrl?.trim()) {
        setError('Facebook RTMP URL is required when Facebook is enabled.');
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
      if (!form.facebookStreamKey?.trim() && !form.facebookStreamKeySet) {
        setError('Facebook Stream Key is required when Facebook is enabled.');
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
    }

    if (showBackupSection) {
      const backupErr = validateBackupStreamFields({
        backupStreamEnabled: form.backupStreamEnabled,
        backupYoutubeVideoId: form.backupYoutubeVideoId,
      });
      if (backupErr) {
        setError(backupErr);
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
      if (
        form.backupYoutubeVideoId?.trim() &&
        !extractYouTubeId(form.backupYoutubeVideoId)
      ) {
        setError('Enter a valid backup YouTube Video ID or Live URL.');
        saveInFlightRef.current = false;
        setSubmitting(false);
        return;
      }
    }

    const startIso = form.startTime ? new Date(form.startTime).toISOString() : undefined;
    // End time UI removed — keep API required field by defaulting to 24h after start when unset.
    let endIso = form.endTime ? new Date(form.endTime).toISOString() : undefined;
    if (!endIso && startIso) {
      endIso = new Date(new Date(startIso).getTime() + 24 * 60 * 60 * 1000).toISOString();
    }

    const payload = {
      title: form.title.trim(),
      // Description removed from create UI; backend still requires a value.
      description: form.description.trim() || form.title.trim(),
      category: form.category || 'other',
      status: form.status,
      isOnline: form.isOnline,
      location: form.isOnline ? 'Online' : form.location,
      venue: form.venue?.trim() || '',
      capacity: Number(form.capacity) || 0,
      startTime: startIso,
      endTime: endIso,
      brideName: form.brideName?.trim() || '',
      groomName: form.groomName?.trim() || '',
      pageTemplate: form.pageTemplate === 'classic-wedding' ? 'classic-wedding' : 'default',
      chatEnabled: form.chatEnabled,
    };

    if (form.isOnline) {
      payload.streamType = streamType;
      payload.linkType = streamType;
      payload.streamingDestination = streamType;
      if (streamType === 'youtube') {
        if (rawYoutubeUrl) {
          payload.streamUrl = rawYoutubeUrl;
          payload.youtubeWatchUrl = rawYoutubeUrl;
          payload.youtubeLiveUrl = rawYoutubeUrl;
          payload.youtubeVideoId = youtubeVideoId || rawYoutubeUrl;
        }
        payload.streamProvider = 'youtube';
        payload.youtubeForwardEnabled = false;
        payload.youtubeRtmpUrl = form.youtubeRtmpUrl?.trim() || '';
        if (form.youtubeStreamKey?.trim()) {
          payload.youtubeStreamKey = form.youtubeStreamKey.trim();
        }
      } else if (streamType === 'server_youtube' || streamType === 'youtube_server') {
        payload.streamProvider = 'rtmp';
        payload.youtubeForwardEnabled = form.youtubeForwardEnabled !== false;
        payload.youtubeRtmpUrl = form.youtubeRtmpUrl?.trim() || 'rtmp://a.rtmp.youtube.com/live2';
        if (form.youtubeStreamKey?.trim()) {
          payload.youtubeStreamKey = form.youtubeStreamKey.trim();
        }
        if (streamType === 'youtube_server') {
          if (rawYoutubeUrl) {
            payload.streamUrl = rawYoutubeUrl;
            payload.youtubeWatchUrl = rawYoutubeUrl;
            payload.youtubeLiveUrl = rawYoutubeUrl;
            payload.youtubeVideoId = youtubeVideoId || rawYoutubeUrl;
          }
        }
        if (form.hlsUrl?.trim()) payload.hlsUrl = form.hlsUrl.trim();
        if (showBackupSection) {
          payload.backupStreamEnabled = Boolean(form.backupStreamEnabled);
          payload.backupYoutubeVideoId = form.backupStreamEnabled
            ? extractYouTubeId(form.backupYoutubeVideoId) || ''
            : '';
        }
      } else {
        // Server (optionally + Facebook forward)
        payload.streamProvider = 'rtmp';
        payload.youtubeVideoId = '';
        payload.streamUrl = '';
        payload.youtubeForwardEnabled = false;
        if (form.hlsUrl?.trim()) payload.hlsUrl = form.hlsUrl.trim();
        if (showBackupSection) {
          payload.backupStreamEnabled = Boolean(form.backupStreamEnabled);
          payload.backupYoutubeVideoId = form.backupStreamEnabled
            ? extractYouTubeId(form.backupYoutubeVideoId) || ''
            : '';
        }
      }
      // Facebook is additive — never changes website playback destination.
      payload.facebookForwardEnabled = Boolean(destFacebook);
      if (destFacebook) {
        payload.facebookRtmpUrl = form.facebookRtmpUrl?.trim() || DEFAULT_FACEBOOK_RTMP;
        if (form.facebookStreamKey?.trim()) {
          payload.facebookStreamKey = form.facebookStreamKey.trim();
        }
      } else {
        payload.facebookForwardEnabled = false;
      }
      // Live ABR only when Super Admin opts into Adaptive (Premium). Default Standard.
      if (streamType !== 'youtube' && isSuperAdmin) {
        payload.adaptiveStreaming = Boolean(form.adaptiveStreaming);
      }
    }

    if (form.tags?.trim()) {
      payload.tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const studioKeys = [
      'studioName',
      'photographerName',
      'studioPhone',
      'studioWhatsapp',
      'studioEmail',
      'studioWebsite',
      'studioInstagram',
      'studioFacebook',
      'studioYoutube',
      'studioMapsUrl',
    ];
    for (const key of studioKeys) {
      if (studioForm[key]) payload[key] = studioForm[key];
    }

    if (form.theme) payload.theme = form.theme;

    const pendingCover = pendingCoverRef.current;
    const pendingThumb = pendingThumbRef.current;
    const pendingLogo = pendingLogoRef.current;
    const pendingHero = pendingHeroRef.current;
    const pendingBride = pendingBridePhotoRef.current;
    const pendingGroom = pendingGroomPhotoRef.current;
    pendingCoverRef.current = null;
    pendingThumbRef.current = null;
    pendingLogoRef.current = null;
    pendingHeroRef.current = null;
    pendingBridePhotoRef.current = null;
    pendingGroomPhotoRef.current = null;

    let saved = null;
    try {
      saved = isEdit
        ? await eventService.update(id, payload)
        : await eventService.create(payload);

      if (saved?.youtubeIngest) setYoutubeIngest(saved.youtubeIngest);

      if (saved) {
        setForm((f) => ({
          ...f,
          shortCode: saved.shortCode || f.shortCode,
          slug: saved.slug || f.slug,
          qrCodeImage: saved.qrCodeImage || f.qrCodeImage,
          qrCodeTargetUrl: saved.qrCodeTargetUrl || f.qrCodeTargetUrl,
          pageTemplate: saved.pageTemplate || f.pageTemplate,
        }));
      }

      if (!isEdit && saved?.id) {
        const uploads = [];
        if (pendingCover) uploads.push(eventService.uploadCover(saved.id, pendingCover));
        if (pendingThumb) uploads.push(eventService.uploadShareThumbnail(saved.id, pendingThumb));
        if (pendingLogo) uploads.push(eventService.uploadLogo(saved.id, pendingLogo));
        if (pendingHero) uploads.push(eventService.uploadTemplateImage(saved.id, 'hero', pendingHero));
        if (pendingBride) uploads.push(eventService.uploadTemplateImage(saved.id, 'bride', pendingBride));
        if (pendingGroom) uploads.push(eventService.uploadTemplateImage(saved.id, 'groom', pendingGroom));
        if (uploads.length) {
          const results = await Promise.all(uploads);
          const thumbResult = results.find((r) => r && r.shareThumbnail);
          if (thumbResult?.shareThumbnail) {
            setForm((f) => ({ ...f, shareThumbnail: thumbResult.shareThumbnail }));
            setThumbDirty(false);
          }
        }
        if (usesServerIngest) {
          try {
            const keyInfo = await streamService.getKey(saved.id);
            setServerStream({
              rtmpUrl: keyInfo.ingestUrl || '',
              streamKey: keyInfo.streamKey || '',
              hlsPlayerUrl: keyInfo.playbackUrl || '',
            });
          } catch {
            /* credentials available on edit page */
          }
        }
      }

      if (isEdit && pendingThumb && saved?.id) {
        await persistThumbFile(saved.id, pendingThumb);
      }

      if (!isAdmin) await refreshUser().catch(() => {});
    } catch (err) {
      pendingCoverRef.current = pendingCover;
      pendingThumbRef.current = pendingThumb;
      pendingLogoRef.current = pendingLogo;
      pendingHeroRef.current = pendingHero;
      pendingBridePhotoRef.current = pendingBride;
      pendingGroomPhotoRef.current = pendingGroom;
      const message = err.message || 'Failed to save event. Please try again.';
      // eslint-disable-next-line no-console
      console.error('[EventForm] save failed:', {
        isEdit,
        status: err.status,
        code: err.code,
        message: err.message,
        response: err.response?.data,
      });
      setError(message);
      showToast(message);
      return;
    } finally {
      saveInFlightRef.current = false;
      setSubmitting(false);
    }

    if (saved) {
      navigate(isEdit ? `/events/${saved.slug || saved.id}` : `/events/${saved.id}/edit`, {
        replace: true,
      });
    }
  };

  if (!isStaffEditor) {
    return <Navigate to={isEdit ? `/live-links/${id}/edit` : '/live-links/new'} replace />;
  }

  if (loading) return <p className="py-20 text-center text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
        {isEdit ? 'Edit event' : 'Create event'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Fill in the details below. Fields marked with sections help you set up a
        beautiful live wedding broadcast.
      </p>

      {isEdit && id && (
        <div className="mt-6">
          <EventQrCard
            event={{
              id,
              title: form.title,
              brideName: form.brideName,
              groomName: form.groomName,
              shortCode: form.shortCode,
              slug: form.slug,
              brandDomain: form.brandDomain,
              qrCodeImage: form.qrCodeImage,
              qrCodeTargetUrl: form.qrCodeTargetUrl,
            }}
            suspendAutoSync={submitting}
            onQrUpdated={handleQrUpdated}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
            {/credit/i.test(error) && (
              <>
                {' '}
                <Link to="/dashboard#buy-credits" className="font-semibold underline">
                  Buy credits
                </Link>
              </>
            )}
          </div>
        )}

        {/* ── Basics ─────────────────────────────────────────── */}
        <Section title="Event details">
          <Field label="Title" htmlFor="title">
            <input id="title" name="title" required minLength={3} maxLength={120}
              className="input" value={form.title} onChange={handleChange}
              placeholder="e.g. Aarav & Priya — Wedding Live" />
          </Field>

          {isEdit && (
            <Field label="Description" htmlFor="description">
              <textarea id="description" name="description" rows={5}
                className="input" value={form.description} onChange={handleChange} />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="category">
              <select id="category" name="category" className="input capitalize"
                value={EVENT_CATEGORIES.includes(form.category) ? form.category : 'other'}
                onChange={handleChange}>
                {EVENT_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="status">
              <select id="status" name="status" className="input capitalize"
                value={form.status} onChange={handleChange}>
                {EVENT_STATUSES.map((s) => (
                  <option key={s} value={s} className="capitalize">{s}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Start time" htmlFor="startTime">
            <input id="startTime" name="startTime" type="datetime-local" required
              className="input" value={form.startTime} onChange={handleChange} />
          </Field>
        </Section>

        {/* ── Page template ──────────────────────────────────── */}
        <Section
          title="Page template"
          subtitle="Optional premium public page. Leave as Default to keep the current EventLive-Pro watch page."
        >
          <Field label="Public page design" htmlFor="pageTemplate">
            <select
              id="pageTemplate"
              name="pageTemplate"
              className="input"
              value={form.pageTemplate || 'default'}
              onChange={handleChange}
            >
              <option value="default">Default (current EventLive-Pro page)</option>
              <option value="classic-wedding">Classic Wedding</option>
            </select>
          </Field>

          {form.pageTemplate === 'classic-wedding' && (
            <div className="mt-4 space-y-4 rounded-xl border border-teal-100 bg-teal-50/50 p-4">
              <p className="text-sm text-teal-900">
                Classic Wedding uses a full-screen invitation-style hero. Upload a hero background
                (recommended). Couple / bride / groom photos are optional.
              </p>
              <ImageUploadField
                label="Hero background image"
                preview={form.heroBackgroundImage}
                inputRef={heroInputRef}
                uploading={uploadingTemplateImg}
                onChange={(e) => handleTemplateImageUpload('hero', e)}
              />
              <ImageUploadField
                label="Bride photo (optional)"
                preview={form.bridePhoto}
                inputRef={bridePhotoInputRef}
                uploading={uploadingTemplateImg}
                onChange={(e) => handleTemplateImageUpload('bride', e)}
              />
              <ImageUploadField
                label="Groom photo (optional)"
                preview={form.groomPhoto}
                inputRef={groomPhotoInputRef}
                uploading={uploadingTemplateImg}
                onChange={(e) => handleTemplateImageUpload('groom', e)}
              />
            </div>
          )}
        </Section>

        {/* ── Professional theme ─────────────────────────────── */}
        <Section
          title="Choose a theme"
          subtitle="10 premium layout themes — optional; pick one for a custom live page design. Ignored when Classic Wedding page template is selected."
        >
          <ThemeGallery
            themes={allThemes}
            selectedId={form.theme}
            onSelect={(tid) => setForm((f) => ({ ...f, theme: tid }))}
            loading={themesLoading}
          />
          {form.theme && (
            <p className="mt-3 text-xs text-emerald-700">Theme selected — it will appear on your live watch page.</p>
          )}
        </Section>

        {/* ── Couple ─────────────────────────────────────────── */}
        <Section title="The couple" subtitle="Shown on the live watch page.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bride's name" htmlFor="brideName">
              <input id="brideName" name="brideName" className="input" maxLength={80}
                placeholder="e.g. Priya" value={form.brideName} onChange={handleChange} />
            </Field>
            <Field label="Groom's name" htmlFor="groomName">
              <input id="groomName" name="groomName" className="input" maxLength={80}
                placeholder="e.g. Aarav" value={form.groomName} onChange={handleChange} />
            </Field>
          </div>

          <Field label="Venue" htmlFor="venue" hint="The ceremony venue, shown on the watch page.">
            <input id="venue" name="venue" className="input" maxLength={200}
              placeholder="e.g. The Leela Palace, Udaipur" value={form.venue} onChange={handleChange} />
          </Field>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Couple photo</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.coverImage ? (
                <img
                  src={resolveMediaUrl(form.coverImage)}
                  alt="Couple"
                  className="h-20 w-28 rounded-lg border border-slate-200 object-cover"
                />
              ) : (
                <div className="grid h-20 w-28 place-items-center rounded-lg border border-dashed border-slate-300 text-center text-xs text-slate-400">
                  No photo
                </div>
              )}
              <div>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverUpload}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  disabled={uploadingCover}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {uploadingCover
                    ? 'Uploading…'
                    : isEdit
                      ? 'A hero photo of the couple. JPG/PNG, up to 8 MB.'
                      : 'Select a photo — it will upload when you create the event.'}
                </p>
              </div>
            </div>
            <YoutubeThumbnailPreview
              coverSrc={form.coverImage}
              previewSrc={thumbPreview || form.shareThumbnail}
              generating={generatingThumb}
              saving={uploadingThumb}
              dirty={thumbDirty}
              hasCover={Boolean(form.coverImage || coverSourceRef.current || pendingCoverRef.current)}
              stored={Boolean(form.shareThumbnail)}
              error={thumbError}
              onRegenerate={handleRegenerateThumbnail}
              onSave={handleSaveThumbnail}
              onDownload={handleDownloadThumbnail}
            />
          </div>
        </Section>

        {/* ── Streaming ──────────────────────────────────────── */}
        <Section title="Live stream">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="isOnline" checked={form.isOnline} onChange={handleChange} />
            This is an online event (live streamed)
          </label>

          {form.isOnline ? (
            <>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Streaming destinations</p>
                <p className="mb-3 text-xs text-slate-500">
                  OBS always publishes to MediaMTX when Server (or Facebook) is enabled. MediaMTX
                  forwards to every checked destination. Website playback follows Server / YouTube
                  rules below — Facebook never changes the watch-page player.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-6">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={destServer || destFacebook}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setDestServer(on);
                        if (!on) setDestFacebook(false);
                      }}
                    />
                    Server
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={destYoutube}
                      onChange={(e) => setDestYoutube(e.target.checked)}
                    />
                    YouTube
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={destFacebook}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setDestFacebook(on);
                        if (on) setDestServer(true);
                      }}
                    />
                    Facebook
                  </label>
                </div>
                {(destServer || destFacebook) && destYoutube && (
                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-700">Website live player</p>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="websitePlayer"
                        checked={websitePlayer === 'hls'}
                        onChange={() => setWebsitePlayer('hls')}
                      />
                      Server HLS (Server + YouTube)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="websitePlayer"
                        checked={websitePlayer === 'youtube'}
                        onChange={() => setWebsitePlayer('youtube')}
                      />
                      YouTube Embed (YouTube + Server)
                    </label>
                  </div>
                )}
                {showCreditCosts && (
                  <p className="mt-2 text-xs text-slate-500">
                    Your balance: {balance} credit{balance === 1 ? '' : 's'}.{' '}
                    {streamType === 'youtube'
                      ? 'YouTube costs 1 credit.'
                      : 'Server destinations (including Facebook / YouTube forward) cost 5 credits.'}{' '}
                    Credits are deducted when the event is created.
                  </p>
                )}
                {insufficient && (
                  <p className="mt-2 text-sm text-amber-700">
                    You need {cost - balance} more credit{cost - balance === 1 ? '' : 's'} for this
                    destination.{' '}
                    <Link to="/dashboard#buy-credits" className="font-semibold underline">
                      Buy credits
                    </Link>
                    .
                  </p>
                )}
              </div>

              {showYoutubeEmbedUrl && (
                <Field
                  label={streamType === 'youtube_server' ? 'YouTube Video / Embed URL' : 'YouTube Live URL'}
                  htmlFor="youtubeUrl"
                  hint={
                    youtubeConnected
                      ? 'Optional. Leave blank to auto-create a YouTube live from your connected channel. Paste a URL only to reuse an existing live.'
                      : streamType === 'youtube_server'
                        ? 'Used on the public watch page (YouTube embed). Server HLS is hidden while live.'
                        : 'Paste the YouTube Live URL or video ID. It will be embedded on the watch page.'
                  }
                >
                  <input
                    id="youtubeUrl"
                    name="youtubeUrl"
                    type="text"
                    placeholder={
                      youtubeConnected
                        ? 'Leave blank to auto-create, or paste https://youtube.com/live/…'
                        : 'https://youtube.com/live/…  or  https://youtu.be/…'
                    }
                    className="input"
                    value={form.youtubeUrl}
                    onChange={handleChange}
                  />
                  {form.youtubeUrl && (
                    <p className="mt-1 text-xs text-slate-400">
                      {extractYouTubeId(form.youtubeUrl)
                        ? `Detected video ID: ${extractYouTubeId(form.youtubeUrl)}`
                        : 'Could not detect a YouTube video ID yet.'}
                    </p>
                  )}
                </Field>
              )}

              {showYoutubeRtmpFields && (
                <div className="space-y-4 rounded-xl border border-red-100 bg-red-50/40 p-4">
                  <p className="text-sm font-medium text-slate-800">YouTube RTMP credentials</p>
                  <p className="text-xs text-slate-600">
                    {streamType === 'server_youtube'
                      ? 'OBS streams only to MediaMTX. MediaMTX forwards the same feed to YouTube when forwarding is enabled. The website plays server HLS.'
                      : streamType === 'youtube_server'
                        ? 'OBS streams only to MediaMTX (recordings stay on the server). MediaMTX forwards to YouTube. The website plays the YouTube embed — not server HLS.'
                        : 'Optional: store your YouTube Studio RTMP URL and stream key for OBS. The website still embeds the YouTube Live URL above.'}
                  </p>
                  <Field
                    label="YouTube Server URL"
                    htmlFor="youtubeRtmpUrl"
                    hint="From YouTube Studio → Go Live → Stream settings (usually rtmp://a.rtmp.youtube.com/live2)."
                  >
                    <input
                      id="youtubeRtmpUrl"
                      name="youtubeRtmpUrl"
                      type="text"
                      className="input font-mono text-xs"
                      placeholder="rtmp://a.rtmp.youtube.com/live2"
                      value={form.youtubeRtmpUrl}
                      onChange={handleChange}
                      required={needsYoutubeForward && !youtubeConnected}
                    />
                  </Field>
                  <Field
                    label="Stream Key"
                    htmlFor="youtubeStreamKey"
                    hint={
                      form.youtubeStreamKeySet
                        ? 'A key is already saved. Leave blank to keep it, or paste a new key to replace it.'
                        : 'From YouTube Studio. Never shared on public pages.'
                    }
                  >
                    <input
                      id="youtubeStreamKey"
                      name="youtubeStreamKey"
                      type="password"
                      autoComplete="off"
                      className="input font-mono text-xs"
                      placeholder={form.youtubeStreamKeySet ? '•••••••• (saved)' : 'YouTube stream key'}
                      value={form.youtubeStreamKey}
                      onChange={handleChange}
                      required={needsYoutubeForward && !form.youtubeStreamKeySet && !youtubeConnected}
                    />
                  </Field>
                  {needsYoutubeForward && (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="youtubeForwardEnabled"
                        checked={form.youtubeForwardEnabled !== false}
                        onChange={handleChange}
                      />
                      Enable YouTube forwarding for this event
                    </label>
                  )}
                </div>
              )}

              {destYoutube && youtubeConnected && !form.youtubeUrl && !isEdit && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  YouTube is connected. A live broadcast will be created automatically when you save
                  this event.
                </p>
              )}

              {destYoutube && (youtubeIngest?.watchUrl || youtubeIngest?.streamKey) && (
                <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <p className="text-sm font-semibold text-emerald-900">YouTube Live (generated)</p>
                  <p className="text-xs text-slate-600">
                    Use these credentials in OBS to publish to YouTube. The watch page embeds this
                    live URL.
                  </p>
                  {youtubeIngest.watchUrl ? (
                    <Field label="YouTube Live URL" htmlFor="generatedYoutubeWatchUrl">
                      <input
                        id="generatedYoutubeWatchUrl"
                        readOnly
                        className="input font-mono text-xs"
                        value={youtubeIngest.watchUrl}
                      />
                    </Field>
                  ) : null}
                  {youtubeIngest.broadcastId ? (
                    <p className="text-xs text-slate-500">Broadcast ID: {youtubeIngest.broadcastId}</p>
                  ) : null}
                  {youtubeIngest.rtmpUrl ? (
                    <Field label="YouTube RTMP URL (OBS Server)" htmlFor="generatedYoutubeRtmp">
                      <input
                        id="generatedYoutubeRtmp"
                        readOnly
                        className="input font-mono text-xs"
                        value={youtubeIngest.rtmpUrl}
                      />
                    </Field>
                  ) : null}
                  {youtubeIngest.streamKey ? (
                    <Field label="YouTube Stream Key" htmlFor="generatedYoutubeKey">
                      <input
                        id="generatedYoutubeKey"
                        readOnly
                        className="input font-mono text-xs"
                        value={youtubeIngest.streamKey}
                      />
                    </Field>
                  ) : null}
                </div>
              )}

              {showFacebookFields && (
                <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/40 p-4">
                  <p className="text-sm font-medium text-slate-800">Facebook Live credentials</p>
                  <p className="text-xs text-slate-600">
                    OBS streams only to MediaMTX. MediaMTX forwards a copy to Facebook Live. The
                    website player is unchanged (Server HLS or YouTube embed per destinations above).
                  </p>
                  <Field
                    label="Facebook RTMP URL"
                    htmlFor="facebookRtmpUrl"
                    hint="From Facebook Live Producer → Go Live → Streaming software (usually rtmps://live-api-s.facebook.com:443/rtmp)."
                  >
                    <input
                      id="facebookRtmpUrl"
                      name="facebookRtmpUrl"
                      type="text"
                      className="input font-mono text-xs"
                      placeholder={DEFAULT_FACEBOOK_RTMP}
                      value={form.facebookRtmpUrl}
                      onChange={handleChange}
                      required
                    />
                  </Field>
                  <Field
                    label="Facebook Stream Key"
                    htmlFor="facebookStreamKey"
                    hint={
                      form.facebookStreamKeySet
                        ? 'A key is already saved. Leave blank to keep it, or paste a new key to replace it.'
                        : 'From Facebook Live Producer. Never shared on public pages or API responses.'
                    }
                  >
                    <input
                      id="facebookStreamKey"
                      name="facebookStreamKey"
                      type="password"
                      autoComplete="off"
                      className="input font-mono text-xs"
                      placeholder={
                        form.facebookStreamKeySet ? '•••••••• (saved)' : 'Facebook stream key'
                      }
                      value={form.facebookStreamKey}
                      onChange={handleChange}
                      required={!form.facebookStreamKeySet}
                    />
                  </Field>
                </div>
              )}

              {usesServerIngest && (
                <div className="space-y-4 rounded-xl border border-gold-200 bg-gold-50/50 p-4">
                  {isSuperAdmin ? (
                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white/70 p-3">
                      <p className="text-sm font-medium text-slate-800">Streaming Mode</p>
                      <label className="flex items-start gap-3 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="streamingMode"
                          className="mt-1"
                          checked={!form.adaptiveStreaming}
                          onChange={() => setForm((f) => ({ ...f, adaptiveStreaming: false }))}
                        />
                        <span>
                          <span className="font-medium">Standard (Default)</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Single HLS from MediaMTX · Low CPU · Lowest VPS cost
                          </span>
                        </span>
                      </label>
                      <label className="flex items-start gap-3 text-sm text-slate-700">
                        <input
                          type="radio"
                          name="streamingMode"
                          className="mt-1"
                          checked={Boolean(form.adaptiveStreaming)}
                          onChange={() => setForm((f) => ({ ...f, adaptiveStreaming: true }))}
                        />
                        <span>
                          <span className="font-medium">Adaptive (Premium)</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            1080p + 480p ABR via FFmpeg for this event only · High CPU
                          </span>
                        </span>
                      </label>
                    </div>
                  ) : null}
                  <p className="text-sm text-slate-600">
                    {streamType === 'server_youtube' || streamType === 'youtube_server'
                      ? 'Point OBS at our MediaMTX server only. YouTube receives a forwarded copy automatically when forwarding is enabled.'
                      : 'Stream to our premium RTMP server. Use these credentials in OBS or your encoder.'}
                  </p>
                  {streamType === 'youtube_server' && (
                    <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">
                      Public watch page uses the <strong>YouTube embed</strong> while live. Server
                      recordings / replay still come from MediaMTX after the stream ends.
                    </p>
                  )}
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    OBS Settings → Output → Streaming: Keyframe Interval = <strong>2</strong> (seconds),
                    Rate Control CBR, bitrate 1500–2500 kbps for 720p. Put only the Stream Key in OBS —
                    do not paste the full RTMP URL into the key field.
                  </p>
                  {isEdit && serverStreamLoading && (
                    <p className="text-sm text-slate-500">Loading stream credentials…</p>
                  )}
                  {isEdit && serverStream && !serverStreamLoading && (
                    <>
                      <Field label="OBS Server URL" htmlFor="rtmpUrl">
                        <input
                          id="rtmpUrl"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.rtmpUrl}
                        />
                      </Field>
                      <Field label="Stream Key" htmlFor="streamKey">
                        <input
                          id="streamKey"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.streamKey}
                        />
                      </Field>
                      <Field
                        label="HLS Playback URL"
                        htmlFor="hlsPlayerUrl"
                        hint="Used on the public watch page for MediaMTX playback."
                      >
                        <input
                          id="hlsPlayerUrl"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.hlsPlayerUrl}
                        />
                      </Field>
                    </>
                  )}
                  {!isEdit && serverStream && (
                    <>
                      <Field label="OBS Server URL" htmlFor="rtmpUrlNew">
                        <input
                          id="rtmpUrlNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.rtmpUrl}
                        />
                      </Field>
                      <Field label="Stream Key" htmlFor="streamKeyNew">
                        <input
                          id="streamKeyNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.streamKey}
                        />
                      </Field>
                      <Field label="HLS Playback URL" htmlFor="hlsPlayerUrlNew">
                        <input
                          id="hlsPlayerUrlNew"
                          readOnly
                          className="input font-mono text-xs"
                          value={serverStream.hlsPlayerUrl}
                        />
                      </Field>
                    </>
                  )}
                  {!isEdit && !serverStream && (
                    <p className="text-sm text-slate-500">
                      RTMP URL, stream key, and HLS player URL will be generated when you save this
                      event.
                    </p>
                  )}
                  <Field
                    label="Custom HLS URL (optional)"
                    htmlFor="hlsUrl"
                    hint="Override the default HLS playback URL if needed."
                  >
                    <input
                      id="hlsUrl"
                      name="hlsUrl"
                      type="text"
                      placeholder="https://…/master.m3u8"
                      className="input font-mono text-xs"
                      value={form.hlsUrl}
                      onChange={handleChange}
                    />
                  </Field>
                  {showBackupSection ? (
                    <BackupStreamSettings
                      enabled
                      value={{
                        backupStreamEnabled: form.backupStreamEnabled,
                        backupYoutubeVideoId: form.backupYoutubeVideoId,
                      }}
                      onChange={(next) =>
                        setForm((f) => ({
                          ...f,
                          backupStreamEnabled: Boolean(next.backupStreamEnabled),
                          backupYoutubeVideoId: next.backupYoutubeVideoId || '',
                        }))
                      }
                    />
                  ) : null}
                </div>
              )}
            </>
          ) : (
            <Field label="Venue / location" htmlFor="location">
              <input id="location" name="location" className="input"
                value={form.location} onChange={handleChange} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <input type="checkbox" name="chatEnabled" checked={form.chatEnabled} onChange={handleChange} />
            Enable live chat on the watch page
          </label>
        </Section>

        {/* ── Photography branding ───────────────────────────── */}
        <Section
          title="Photography studio"
          subtitle="Optional. Shown on the public watch page as “Captured by”. All contact and social fields are optional."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Studio name" htmlFor="studioName">
              <input
                id="studioName"
                name="studioName"
                className="input"
                maxLength={120}
                placeholder="e.g. Moments Studio"
                value={form.studioName}
                onChange={handleChange}
              />
            </Field>
            <Field label="Photographer name" htmlFor="photographerName">
              <input
                id="photographerName"
                name="photographerName"
                className="input"
                maxLength={120}
                placeholder="e.g. Rahul Sharma"
                value={form.photographerName}
                onChange={handleChange}
              />
            </Field>
          </div>

          <div>
            <span className="mb-1 block text-sm font-medium text-slate-700">Studio logo</span>
            <div className="flex flex-wrap items-center gap-4">
              {form.photographerLogo ? (
                <img
                  src={resolveMediaUrl(form.photographerLogo)}
                  alt="Studio logo"
                  className="h-16 w-16 rounded-lg border border-slate-200 object-contain p-1"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
                  No logo
                </div>
              )}
              <div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
                  disabled={uploadingLogo}
                />
                <p className="mt-1 text-xs text-slate-400">
                  {uploadingLogo
                    ? 'Uploading…'
                    : isEdit
                      ? 'PNG/JPG/SVG, up to 8 MB.'
                      : 'Select a logo — it will upload when you create the event.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone number (optional)" htmlFor="studioPhone">
              <input
                id="studioPhone"
                name="studioPhone"
                type="tel"
                className="input"
                maxLength={30}
                placeholder="+91 98765 43210"
                value={form.studioPhone}
                onChange={handleChange}
              />
            </Field>
            <Field label="WhatsApp number (optional)" htmlFor="studioWhatsapp">
              <input
                id="studioWhatsapp"
                name="studioWhatsapp"
                type="tel"
                className="input"
                maxLength={30}
                placeholder="+91 98765 43210"
                value={form.studioWhatsapp}
                onChange={handleChange}
              />
            </Field>
          </div>

          <Field label="Email (optional)" htmlFor="studioEmail">
            <input
              id="studioEmail"
              name="studioEmail"
              type="text"
              inputMode="email"
              autoComplete="email"
              className="input"
              maxLength={120}
              placeholder="hello@studio.com"
              value={form.studioEmail}
              onChange={handleChange}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website URL (optional)" htmlFor="studioWebsite" hint="Full URL or domain, e.g. momentsstudio.com">
              <input
                id="studioWebsite"
                name="studioWebsite"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://momentsstudio.com"
                value={form.studioWebsite}
                onChange={handleChange}
              />
            </Field>
            <Field label="Google Maps URL (optional)" htmlFor="studioMapsUrl">
              <input
                id="studioMapsUrl"
                name="studioMapsUrl"
                type="text"
                className="input"
                maxLength={500}
                placeholder="https://maps.google.com/…"
                value={form.studioMapsUrl}
                onChange={handleChange}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instagram URL (optional)" htmlFor="studioInstagram">
              <input
                id="studioInstagram"
                name="studioInstagram"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://instagram.com/…"
                value={form.studioInstagram}
                onChange={handleChange}
              />
            </Field>
            <Field label="Facebook URL (optional)" htmlFor="studioFacebook">
              <input
                id="studioFacebook"
                name="studioFacebook"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://facebook.com/…"
                value={form.studioFacebook}
                onChange={handleChange}
              />
            </Field>
            <Field label="YouTube URL (optional)" htmlFor="studioYoutube">
              <input
                id="studioYoutube"
                name="studioYoutube"
                type="text"
                className="input"
                maxLength={300}
                placeholder="https://youtube.com/@…"
                value={form.studioYoutube}
                onChange={handleChange}
              />
            </Field>
          </div>
        </Section>

        {/* ── Extras ─────────────────────────────────────────── */}
        <Section title="More">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Capacity (0 = unlimited)" htmlFor="capacity">
              <input id="capacity" name="capacity" type="number" min={0}
                className="input" value={form.capacity} onChange={handleChange} />
            </Field>
            <Field label="Tags (comma separated)" htmlFor="tags">
              <input id="tags" name="tags" placeholder="wedding, live, 2026"
                className="input" value={form.tags} onChange={handleChange} />
            </Field>
          </div>
        </Section>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button
            type="submit"
            className="btn-primary w-full sm:w-auto"
            disabled={submitting || uploadingLogo || uploadingCover || uploadingThumb || uploadingTemplateImg || insufficient}
          >
            {submitting
              ? 'Saving…'
              : isEdit
                ? 'Save changes'
                : showCreditCosts
                  ? `Create link (${cost} credit${cost > 1 ? 's' : ''})`
                  : 'Create event'}
          </button>
          <button type="button" className="btn-ghost w-full sm:w-auto" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </form>
      <ToastBanner toast={toast} onClose={clearToast} />
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="px-1 text-base font-bold text-slate-900">{title}</legend>
      {subtitle && <p className="-mt-2 text-xs text-slate-500">{subtitle}</p>}
      {children}
    </fieldset>
  );
}

function Field({ label, htmlFor, hint, children }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ImageUploadField({ label, preview, inputRef, uploading, onChange }) {
  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex flex-wrap items-center gap-4">
        {preview ? (
          <img
            src={resolveMediaUrl(preview)}
            alt=""
            className="h-20 w-28 rounded-lg object-cover"
          />
        ) : (
          <div className="grid h-20 w-28 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">
            No image
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={uploading}
          onChange={onChange}
          className="block w-full max-w-xs text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal-800"
        />
      </div>
    </div>
  );
}
