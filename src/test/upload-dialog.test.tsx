import { describe, it, expect, vi } from 'vitest';
import { renderWithProviders, screen } from './utils';
import { UploadDialog } from '@/components/domain/UploadDialog';

vi.mock('@/hooks/useAssetApi', () => ({
  useSignUpload: () => ({ mutateAsync: vi.fn() }),
  useCreateAsset: () => ({ mutateAsync: vi.fn() }),
}));

describe('UploadDialog', () => {
  it('renders drag-drop zone when open', () => {
    renderWithProviders(
      <UploadDialog open={true} onOpenChange={() => {}} assetType="character" title="上传角色" />
    );
    expect(screen.getByText(/拖拽文件到此处/)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderWithProviders(
      <UploadDialog open={false} onOpenChange={() => {}} assetType="character" title="上传角色" />
    );
    expect(screen.queryByText(/拖拽文件到此处/)).not.toBeInTheDocument();
  });
});
