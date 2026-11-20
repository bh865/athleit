import { getAttachmentUrl } from '@athleit/db/api';
import { componentTokens, radius, space } from '@athleit/tokens';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Mono, Text, useTheme } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export interface ViewerImage {
  path: string;
  name: string;
}

/**
 * Full-screen image viewer: swipe between the conversation's images, close with the button or the
 * system back gesture. Share and save need native modules (expo-sharing, expo-media-library) and
 * are a marked follow-up.
 */
export function MediaViewer({
  images,
  startPath,
  onClose,
}: {
  images: ViewerImage[];
  startPath: string | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const open = startPath !== null;
  const start = Math.max(
    0,
    images.findIndex((i) => i.path === startPath),
  );
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<ViewerImage>>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset to the tapped image on open
    if (open) setIndex(start);
  }, [open, start]);

  return (
    <Modal visible={open} animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <View style={{ flex: 1, backgroundColor: theme.color.ink }}>
        <FlatList
          ref={list}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(i) => i.path}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => <ViewerPage image={item} width={width} height={height} />}
        />
        <View
          style={{
            position: 'absolute',
            top: insets.top + space[2],
            left: space[4],
            right: space[4],
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close viewer"
            onPress={onClose}
            style={{
              width: componentTokens.minTarget,
              height: componentTokens.minTarget,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.color.surface,
            }}
          >
            <Icon name="x" />
          </Pressable>
          {images.length > 1 ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                padding: space[2],
                borderRadius: radius.pill,
                backgroundColor: theme.color.surface,
              }}
            >
              <Mono>{`${index + 1} of ${images.length}`}</Mono>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ViewerPage({
  image,
  width,
  height,
}: {
  image: ViewerImage;
  width: number;
  height: number;
}) {
  const { theme } = useTheme();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getAttachmentUrl(supabase, image.path).then((r) => live && setUrl(r.data ?? null));
    return () => {
      live = false;
    };
  }, [image.path]);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {url ? (
        <Image
          source={{ uri: url }}
          accessibilityLabel={image.name}
          style={{ width, height }}
          resizeMode="contain"
        />
      ) : (
        <Text style={{ color: theme.color.background }}>Loading…</Text>
      )}
    </View>
  );
}
