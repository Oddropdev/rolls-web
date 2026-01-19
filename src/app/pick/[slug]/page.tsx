import PickClient from "./PickClient";

export default async function PickPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <main className="mx-auto max-w-xl p-6">
      <PickClient slug={slug} />
    </main>
  );
}
