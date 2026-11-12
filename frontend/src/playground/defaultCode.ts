// Copyright (c) Meta Platforms, Inc. and affiliates.
// Adapted from Astryx docsite playground/defaultCode.ts, commit 5770e5b197.
export const DEFAULT_CODE = `import {Card} from '@astryxdesign/core/Card';
import {
  Layout,
  LayoutHeader,
  LayoutContent,
  LayoutFooter,
  HStack,
} from '@astryxdesign/core/Layout';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';

export default function Example() {
  return (
    <Card width={400} padding={4}>
      <Layout
        header={
          <LayoutHeader hasDivider>
            <Heading level={2}>Welcome</Heading>
          </LayoutHeader>
        }
        content={
          <LayoutContent>
            <Text type="body" color="secondary">
              Try out components in the code editor, open a ready-made template,
              and build your own theme in the theme editor — all in one place.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter hasDivider>
            <HStack hAlign="end">
              <Button label="Get started" variant="primary" />
            </HStack>
          </LayoutFooter>
        }
      />
    </Card>
  );
}`
