import {
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Package,
  PackageCheck,
  PackageOpen,
  Search,
  Ship,
  ShoppingBag,
  UsersRound,
  Wallet,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard-data";
import { createClient } from "@/lib/supabase/server";

const navigation = [
  { label: "Vue d’ensemble", href: "#overview", icon: LayoutDashboard },
  { label: "Produits", href: "#products", icon: Package },
  { label: "Expéditions", href: "#shipments", icon: Ship },
  { label: "Stock", href: "#stock", icon: Boxes },
  { label: "Ventes", href: "#sales", icon: ShoppingBag },
  { label: "Clients", href: "#customers", icon: UsersRound },
  { label: "Paiements", href: "#payments", icon: CreditCard },
  { label: "Gestion complète", href: "/management", icon: ClipboardList },
];

const tnd = new Intl.NumberFormat("fr-TN", {
  style: "currency",
  currency: "TND",
  maximumFractionDigits: 0,
});

function formatDate() {
  return new Intl.DateTimeFormat("fr-TN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export default async function Home() {
  const supabase = await createClient();
  const { data: claimsData, error: authError } = await supabase.auth.getClaims();
  const email = typeof claimsData?.claims.email === "string" ? claimsData.claims.email.toLowerCase() : "";

  if (authError || email !== "derbycafe33@gmail.com") {
    redirect("/login");
  }

  const dashboard = await getDashboardData();
  const stockTotal = dashboard.stockDistribution.healthy + dashboard.stockDistribution.low + dashboard.stockDistribution.out;
  const healthyPercent = stockTotal ? dashboard.stockDistribution.healthy / stockTotal * 100 : 0;
  const lowPercent = stockTotal ? dashboard.stockDistribution.low / stockTotal * 100 : 0;
  const lowEnd = healthyPercent + lowPercent;
  const weeklyTotal = dashboard.weeklySales.reduce((sum, day) => sum + day.amount, 0);
  const metric = (value: string) => dashboard.error ? "—" : value;

  return (
    <main className="app-shell" id="overview">
      <aside className="sidebar">
        <a className="brand" href="#overview" aria-label="KBM Stock, accueil">
          <span className="brand-mark"><PackageOpen size={21} strokeWidth={2.1} /></span>
          <span className="brand-name">KBM<span>STOCK</span></span>
        </a>

        <div className="workspace-label">ESPACE DE TRAVAIL</div>
        <nav className="side-nav" aria-label="Navigation principale">
          {navigation.map(({ label, href, icon: Icon }, index) => (
            <a className={`nav-link${index === 0 ? " active" : ""}`} href={href} key={label}>
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Expéditions" && <span className="nav-count">3</span>}
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="mode-label"><span className="status-dot" /> Compte administrateur</div>
          <div className="profile-row">
            <div className="profile-avatar">KB</div>
            <div className="profile-copy"><strong>KBM Commerce</strong><span>Administration</span></div>
            <span className="profile-menu" aria-hidden="true">···</span>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <a className="search-link" href="#products"><Search size={16} /><span>Rechercher un produit ou une vente</span><kbd>/</kbd></a>
          <div className="topbar-right"><span className="topbar-date">{formatDate()}</span><span className="topbar-divider" /><div className="topbar-avatar">KB</div></div>
        </header>

        <div className="dashboard-content">
          <section className="page-heading">
            <div><p className="eyebrow">TABLEAU DE BORD <span>·</span> TUNISIE</p><h1>Bonjour, KBM <span className="wave">✳</span></h1><p className="heading-note">Voici ce qui se passe dans votre commerce aujourd’hui.</p></div>
            <span className={`demo-chip${dashboard.error ? " demo-chip-error" : ""}`}><span /> {dashboard.error ? "Accès à configurer" : "Données en direct"}</span>
          </section>

          {dashboard.error && <div className="database-alert" role="status">{dashboard.error}</div>}

          <section className="metric-grid" aria-label="Indicateurs principaux">
            <article className="metric-card metric-stock" id="stock">
              <div className="metric-top"><span>Valeur du stock</span><span className="metric-icon"><Boxes size={17} /></span></div>
              <strong>{metric(tnd.format(dashboard.inventoryValue))}</strong>
              <div className="metric-foot"><span className="neutral">Prix de vente</span><span>du stock actuel</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>Ventes du mois</span><span className="metric-icon coral"><Wallet size={17} /></span></div>
              <strong>{metric(tnd.format(dashboard.monthlySales))}</strong>
              <div className="metric-foot"><span className="neutral">Depuis le 1er</span><span>de ce mois</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>Unités en stock</span><span className="metric-icon blue"><PackageCheck size={17} /></span></div>
              <strong>{metric(new Intl.NumberFormat("fr-TN").format(dashboard.units))} <small>pcs</small></strong>
              <div className="metric-foot"><span className="neutral">{metric(String(dashboard.productCount))} produits</span><span>référencés</span></div>
            </article>
            <article className="metric-card">
              <div className="metric-top"><span>Expéditions actives</span><span className="metric-icon sand"><Ship size={17} /></span></div>
              <strong>{metric(String(dashboard.activeShipmentCount).padStart(2, "0"))} <small>en route</small></strong>
              <div className="metric-foot"><span className="neutral">{metric(String(dashboard.cartonsInTransit))} cartons</span><span>attendus</span></div>
            </article>
          </section>

          <section className="overview-grid">
            <article className="panel sales-panel" id="sales">
              <div className="panel-heading"><div><p className="panel-kicker">PERFORMANCE</p><h2>Rythme des ventes</h2></div><span className="period-select">Cette semaine <span>⌄</span></span></div>
              <div className="sales-summary"><strong>{metric(tnd.format(weeklyTotal))}</strong><span className="sales-summary-note">sur les 7 derniers jours</span></div>
              <div className="chart" role="img" aria-label="Graphique des ventes de lundi à dimanche">
                <div className="chart-grid"><span>{metric(tnd.format(Math.max(1, weeklyTotal)))}</span><span>{metric(tnd.format(weeklyTotal / 1.5))}</span><span>{metric(tnd.format(weeklyTotal / 3))}</span><span>{metric("0")}</span></div>
                <div className="chart-bars">{dashboard.weeklySales.map((item, index) => <div className="chart-column" key={`${item.day}-${index}`}><div className={`bar${item.amount === Math.max(...dashboard.weeklySales.map((day) => day.amount)) && item.amount > 0 ? " bar-highlight" : ""}`} style={{ height: `${item.height}%` }} /><span>{item.day}</span></div>)}</div>
              </div>
            </article>

            <article className="panel mix-panel">
              <div className="panel-heading"><div><p className="panel-kicker">RÉPARTITION</p><h2>État du stock</h2></div><a className="quiet-link" href="#products">Détails <ArrowUpRight size={14} /></a></div>
              <div className="stock-mix"><div className="donut" style={{ background: stockTotal ? `conic-gradient(#4c966e 0 ${healthyPercent}%, #e5b64d ${healthyPercent}% ${lowEnd}%, #d97862 ${lowEnd}% 100%)` : "#e9ede9" }} role="img" aria-label="Répartition réelle du stock"><div className="donut-center"><strong>{metric(String(stockTotal))}</strong><span>produits</span></div></div><div className="legend"><div><i className="legend-green" /><span>En stock</span><strong>{metric(String(dashboard.stockDistribution.healthy))}</strong></div><div><i className="legend-yellow" /><span>Stock faible</span><strong>{metric(String(dashboard.stockDistribution.low))}</strong></div><div><i className="legend-red" /><span>Rupture</span><strong>{metric(String(dashboard.stockDistribution.out))}</strong></div></div></div>
              <div className="mix-note"><span className="mix-note-icon"><ArrowDownLeft size={14} /></span><span>{dashboard.error ? "Les chiffres s’afficheront après l’autorisation Supabase." : `${dashboard.stockDistribution.low + dashboard.stockDistribution.out} références à surveiller.`}</span></div>
            </article>
          </section>

          <section className="detail-grid">
            <article className="panel table-panel" id="products">
              <div className="panel-heading"><div><p className="panel-kicker">À SURVEILLER</p><h2>Stock faible</h2></div><a className="quiet-link" href="#stock">Tout le stock <ArrowUpRight size={14} /></a></div>
              <div className="product-list">{dashboard.lowStock.map((item) => <div className="product-row" key={item.sku}><div className="product-thumb"><Package size={17} /></div><div className="product-info"><strong>{item.name}</strong><span>SKU {item.sku}</span></div><div className="stock-level"><span className={`stock-number ${item.tone}`}>{item.remaining} pcs</span><span>restantes</span></div></div>)}{dashboard.lowStock.length === 0 && <p className="empty-row">{dashboard.error ? "Stock masqué jusqu’à l’autorisation." : "Aucun produit à faible stock."}</p>}</div>
              <a className="panel-bottom-link" href="#products">{metric(String(dashboard.stockDistribution.low + dashboard.stockDistribution.out))} références à réapprovisionner <ArrowUpRight size={14} /></a>
            </article>

            <article className="panel table-panel" id="shipments">
              <div className="panel-heading"><div><p className="panel-kicker">APPROVISIONNEMENT</p><h2>Expéditions récentes</h2></div><a className="quiet-link" href="#shipments">Historique <ArrowUpRight size={14} /></a></div>
              <div className="shipment-list">{dashboard.shipments.map((shipment) => <div className="shipment-row" key={shipment.code}><div className="shipment-icon"><Ship size={17} /></div><div className="shipment-info"><strong>{shipment.code}</strong><span>{shipment.date} <i /> {shipment.cartons} cartons</span></div><span className={`shipment-status${shipment.status === "Arrivée" ? " arrived" : " transit"}`}><i />{shipment.status}</span></div>)}{dashboard.shipments.length === 0 && <p className="empty-row">{dashboard.error ? "Expéditions masquées jusqu’à l’autorisation." : "Aucune expédition enregistrée."}</p>}</div>
              <a className="panel-bottom-link" href="#shipments">Voir toutes les expéditions <ArrowUpRight size={14} /></a>
            </article>
          </section>

          <section className="panel activity-panel" id="customers">
            <div className="panel-heading"><div><p className="panel-kicker">ACTIVITÉ RÉCENTE</p><h2>Dernières ventes</h2></div><a className="quiet-link" href="#payments">Voir les paiements <ArrowUpRight size={14} /></a></div>
            <div className="activity-table" id="payments"><div className="activity-head"><span>CLIENT</span><span>DÉTAIL</span><span>STATUT</span><span className="amount-cell">MONTANT</span></div>{dashboard.transactions.map((transaction) => <div className="activity-row" key={transaction.id}><div className="customer-cell"><span className="customer-avatar">{transaction.initials}</span><strong>{transaction.name}</strong></div><span className="transaction-detail">{transaction.detail}</span><span className={`payment-status${transaction.status === "Réglée" ? " paid" : transaction.status === "Partielle" ? " partial" : " unpaid"}`}>{transaction.status}</span><strong className="amount-cell">{tnd.format(transaction.amount)}</strong></div>)}{dashboard.transactions.length === 0 && <p className="empty-row">{dashboard.error ? "Ventes masquées jusqu’à l’autorisation." : "Aucune vente enregistrée."}</p>}</div>
          </section>

          <footer className="dashboard-footer"><span>KBM STOCK <i /> Gestion commerciale</span><span>Connexion Supabase sécurisée</span></footer>
        </div>
      </div>
    </main>
  );
}
