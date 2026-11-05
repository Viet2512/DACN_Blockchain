import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

test('renders protected login screen by default', async () => {
  render(<App />);
  expect(screen.getByText(/Đăng nhập tác nhân/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/Tra cứu không cần đăng nhập/i)).toBeInTheDocument());
});
